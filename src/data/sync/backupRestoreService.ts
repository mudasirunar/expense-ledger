import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/data/firebase/firestoreClient';
import {
  Account,
  Allocation,
  CategoryBudget,
  Contact,
  Obligation,
  Payment,
  Project,
  Transaction,
} from '@/domain/entities';
import { Money } from '@/domain/accounting/money';
import { computeDashboardAnalytics } from '@/domain/accounting/dashboardAnalytics';
import { resolveBillPaymentSummary } from '@/domain/accounting/billPaymentsHelper';
import {
  FinancialReportBundle,
  ReportPeriod,
  computeFinancialReports,
} from '@/domain/accounting/financialReports';
import {
  DELETED_RECORDS_COLLECTION,
  USER_DATA_COLLECTIONS,
  clearAllMemoryCaches,
  getLocalWipedAt,
  isRecordActive,
  removeLocalDeletedIds,
  stripUndefinedFields,
} from './dataWipeService';

const BACKUP_SCHEMA_VERSION = 1;
const FIRESTORE_BATCH_LIMIT = 450;

export type UserCollectionName = (typeof USER_DATA_COLLECTIONS)[number];

export interface BackupDataPayload {
  projects: Project[];
  contacts: Contact[];
  accounts: Account[];
  obligations: Obligation[];
  payments: Payment[];
  allocations: Allocation[];
  transactions: Transaction[];
  budgets?: CategoryBudget[];
}

export interface BackupEnvelope {
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  counts: Record<UserCollectionName, number>;
  data: BackupDataPayload;
}

export interface BackupValidationResult {
  valid: boolean;
  envelope?: BackupEnvelope;
  totalRecords: number;
  error?: string;
}

export interface RestoreWriteOp {
  colName: UserCollectionName;
  id: string;
  action: 'create' | 'update';
  payload: Record<string, unknown>;
  clearDeletedRegistry?: boolean;
}

export interface CollectionRestoreSummary {
  toImport: number;
  toUpdate: number;
  skipped: number;
}

export interface SmartRestorePlan {
  toImportCount: number;
  toUpdateCount: number;
  skippedCount: number;
  totalInBackup: number;
  byCollection: Record<UserCollectionName, CollectionRestoreSummary>;
  operations: RestoreWriteOp[];
}

export type FileTransferOutcome = 'shared' | 'downloaded' | 'cancelled';

async function triggerFileDownload(
  content: BlobPart,
  filename: string,
  mimeType: string
): Promise<FileTransferOutcome> {
  const blob = new Blob([content], { type: mimeType });

  // On mobile / iOS Home-Screen PWA, prefer native Share Sheet (Save to Files, AirDrop, etc.)
  const isTouchMobile =
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (
    isTouchMobile &&
    typeof File !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      const file = new File([blob], filename, { type: mimeType });
      if (navigator.canShare({ files: [file] })) {
        // Pass only `files` so macOS/iOS Copy doesn't duplicate pasteboard items
        await navigator.share({ files: [file] });
        return 'shared';
      }
    } catch (err) {
      // User dismissed/cancelled the OS Share Sheet — never fall back to download or fake success
      if (err instanceof Error && err.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

function escapeCsvCell(value: string | number | undefined | null): string {
  const str = value == null ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getRecordTimestamp(record: Record<string, unknown>): string {
  if (typeof record.updatedAt === 'string' && record.updatedAt) {
    return record.updatedAt;
  }
  if (typeof record.createdAt === 'string' && record.createdAt) {
    return record.createdAt;
  }
  return '';
}

/**
 * Fetches all active (non-deleted, post-wipe) records across all 7 collections in parallel,
 * ensuring every exported object carries canonical `id`, `createdAt`, and `updatedAt`
 * metadata for deterministic future conflict resolution.
 */
async function fetchAllActiveData(userId: string): Promise<BackupDataPayload> {
  const snapshots = await Promise.all(
    USER_DATA_COLLECTIONS.map((colName) =>
      getDocs(collection(db, 'users', userId, colName))
    )
  );

  const fallbackNow = new Date().toISOString();
  const byCollection: Record<string, unknown[]> = {};

  USER_DATA_COLLECTIONS.forEach((colName, idx) => {
    byCollection[colName] = snapshots[idx].docs
      .map((d) => {
        const raw = d.data() as Record<string, unknown>;
        const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id : d.id;
        const createdAt =
          typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : fallbackNow;
        const updatedAt =
          typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : createdAt;

        return {
          ...raw,
          id,
          createdAt,
          updatedAt,
          isDeleted: raw.isDeleted === true,
        };
      })
      .filter((item) => isRecordActive(userId, item));
  });

  return {
    projects: byCollection.projects as Project[],
    contacts: byCollection.contacts as Contact[],
    accounts: byCollection.accounts as Account[],
    obligations: byCollection.obligations as Obligation[],
    payments: byCollection.payments as Payment[],
    allocations: byCollection.allocations as Allocation[],
    transactions: byCollection.transactions as Transaction[],
    budgets: byCollection.budgets as CategoryBudget[],
  };
}

/**
 * Exports all active user data as a versioned JSON backup file with full IDs and timestamps.
 */
export async function exportFullBackupJson(
  userId: string
): Promise<{ totalRecords: number; filename: string; outcome: FileTransferOutcome }> {
  const data = await fetchAllActiveData(userId);
  const counts: Record<UserCollectionName, number> = {
    projects: data.projects.length,
    contacts: data.contacts.length,
    accounts: data.accounts.length,
    obligations: data.obligations.length,
    payments: data.payments.length,
    allocations: data.allocations.length,
    transactions: data.transactions.length,
    budgets: (data.budgets ?? []).length,
  };
  const totalRecords = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const envelope: BackupEnvelope = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0',
    exportedAt: new Date().toISOString(),
    counts,
    data,
  };

  const dateStamp = envelope.exportedAt.slice(0, 10);
  const filename = `expense-ledger-backup-${dateStamp}.json`;
  const outcome = await triggerFileDownload(
    JSON.stringify(envelope, null, 2),
    filename,
    'application/json'
  );

  return { totalRecords, filename, outcome };
}

function formatLocalTime(isoTimestamp?: string): string {
  if (!isoTimestamp) return '';
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatLocalTime12h(isoTimestamp?: string): string {
  if (!isoTimestamp) return '';
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return '';
  const hours24 = d.getHours();
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hours12}:${mm} ${period}`;
}

/**
 * Builds an RFC-4180 CSV string from active ledger transactions with resolved names,
 * date + time columns, sorted latest-first by date and timestamp.
 */
export function buildTransactionsCsv(
  data: Pick<BackupDataPayload, 'transactions' | 'accounts' | 'projects' | 'contacts'> &
    Partial<Pick<BackupDataPayload, 'obligations' | 'payments' | 'allocations'>>
): string {
  const accountMap = new Map(data.accounts.map((a) => [a.id, a.name]));
  const projectMap = new Map(data.projects.map((p) => [p.id, p.name]));
  const contactMap = new Map(data.contacts.map((c) => [c.id, c.name]));

  const headers = [
    'Date',
    'Time',
    'Record',
    'Type',
    'Scope',
    'Amount (PKR)',
    'Status',
    'Account',
    'Target Account',
    'Project',
    'Contact',
    'Notes',
  ];

  interface CsvEntry {
    date: string;
    createdAt: string;
    cells: string[];
  }

  const entries: CsvEntry[] = [];

  for (const tx of data.transactions) {
    if (tx.status === 'voided') continue;
    entries.push({
      date: tx.date || '',
      createdAt: tx.createdAt || '',
      cells: [
        tx.date || '',
        formatLocalTime(tx.createdAt),
        'Transaction',
        tx.type || '',
        tx.scope || '',
        Money.toMajorString(tx.amountMinor || 0),
        tx.status || '',
        accountMap.get(tx.accountId) || tx.accountId || '',
        tx.targetAccountId ? accountMap.get(tx.targetAccountId) || tx.targetAccountId : '',
        tx.projectId ? projectMap.get(tx.projectId) || tx.projectId : '',
        tx.contactId ? contactMap.get(tx.contactId) || tx.contactId : '',
        tx.notes || '',
      ],
    });
  }

  const obligationMap = new Map((data.obligations ?? []).map((o) => [o.id, o]));

  for (const ob of data.obligations ?? []) {
    if (ob.status === 'voided') continue;
    const summary = resolveBillPaymentSummary(
      ob.id,
      data.payments ?? [],
      data.allocations ?? [],
      data.accounts
    );
    const noteParts: string[] = [];
    if (ob.title) noteParts.push(ob.title);
    if (ob.materialDetails) {
      const { quantity, unit, unitPriceMinor } = ob.materialDetails;
      noteParts.push(`${quantity} ${unit} @ ${Money.toMajorString(unitPriceMinor)}`);
    }
    if (summary.installments.length > 0) {
      const breakdown = summary.installments
        .map((i) => `${i.date}: ${i.accountName} (${Money.toMajorString(i.amountMinor)})`)
        .join('; ');
      noteParts.push(`Payments: ${breakdown}`);
    }
    if (ob.notes) noteParts.push(ob.notes);

    entries.push({
      date: ob.date || '',
      createdAt: ob.createdAt || '',
      cells: [
        ob.date || '',
        formatLocalTime(ob.createdAt),
        'Bill',
        ob.type || '',
        ob.projectId ? 'project' : 'personal',
        Money.toMajorString(ob.totalAmountMinor || 0),
        ob.status || '',
        summary.accountsSummary,
        '',
        ob.projectId ? projectMap.get(ob.projectId) || ob.projectId : '',
        ob.contactId ? contactMap.get(ob.contactId) || ob.contactId : '',
        noteParts.join(' — '),
      ],
    });
  }

  for (const pay of data.payments ?? []) {
    if (pay.status === 'voided') continue;
    const isBillPay = Boolean(pay.linkedBillId || (pay.allocatedAmountMinor || 0) > 0);
    const linkedBill = pay.linkedBillId ? obligationMap.get(pay.linkedBillId) : undefined;
    const billTitle = pay.linkedBillTitle || linkedBill?.title;
    const settlementLabel = isBillPay
      ? pay.billSettlementStatus === 'partially_paid'
        ? 'Partially Paid'
        : 'Bill Paid'
      : pay.direction || '';

    const noteParts: string[] = [];
    if (billTitle) noteParts.push(`Bill: ${billTitle}`);
    if (pay.method) noteParts.push(pay.method);
    if (pay.referenceNumber) noteParts.push(`Ref ${pay.referenceNumber}`);
    if (pay.notes) noteParts.push(pay.notes);

    const effectiveAmountMinor =
      isBillPay && (pay.allocatedAmountMinor || 0) > 0
        ? pay.allocatedAmountMinor
        : pay.amountMinor || 0;

    entries.push({
      date: pay.date || '',
      createdAt: pay.createdAt || '',
      cells: [
        pay.date || '',
        pay.time || formatLocalTime(pay.createdAt),
        'Payment',
        settlementLabel,
        pay.projectId ? 'project' : 'personal',
        Money.toMajorString(effectiveAmountMinor),
        pay.status || '',
        accountMap.get(pay.accountId) || pay.accountId || '',
        '',
        pay.projectId ? projectMap.get(pay.projectId) || pay.projectId : '',
        pay.contactId ? contactMap.get(pay.contactId) || pay.contactId : '',
        noteParts.join(' — '),
      ],
    });
  }

  entries.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const rows = entries.map((entry) => entry.cells.map(escapeCsvCell).join(','));

  return [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
}

/**
 * Exports all active transactions as a spreadsheet-ready CSV file.
 */
export async function exportLedgerCsv(
  userId: string
): Promise<{ rowCount: number; filename: string; outcome: FileTransferOutcome }> {
  const data = await fetchAllActiveData(userId);
  const csv = buildTransactionsCsv(data);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `expense-ledger-transactions-${dateStamp}.csv`;
  const outcome = await triggerFileDownload(csv, filename, 'text/csv;charset=utf-8;');

  const rowCount =
    data.transactions.filter((t) => t.status !== 'voided').length +
    data.obligations.filter((o) => o.status !== 'voided').length +
    data.payments.filter((p) => p.status !== 'voided').length;
  return { rowCount, filename, outcome };
}

export interface ExcelSheetData {
  name: string;
  rows: (string | number)[][];
  headerRowIndices: number[];
  titleRowIndex?: number;
}

function toExcelAmount(minorUnits: number | undefined): number {
  return Number(Money.toMajorString(minorUnits || 0));
}

function formatPrettyLabel(raw: string | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Builds clean, dedicated multi-sheet data (Summary, Expenses & Income, Transfers, Bills, Payments)
 * with zero blank cross-type columns and numeric PKR cells ready for Excel / Google Sheets / Numbers.
 */
export function buildLedgerWorkbookSheets(data: BackupDataPayload): {
  sheets: ExcelSheetData[];
  totalEntries: number;
} {
  const accountMap = new Map(data.accounts.map((a) => [a.id, a.name]));
  const projectMap = new Map(data.projects.map((p) => [p.id, p.name]));
  const contactMap = new Map(data.contacts.map((c) => [c.id, c.name]));

  const analytics = computeDashboardAnalytics({
    accounts: data.accounts,
    projects: data.projects,
    transactions: data.transactions,
    obligations: data.obligations,
    payments: data.payments,
    timeHorizon: 'all',
    scopeFilter: 'all',
  });

  // 1. Summary Sheet
  const summaryHeaderRows: number[] = [3];
  const summaryRows: (string | number)[][] = [
    ['Expense Ledger Summary', ''],
    ['Exported At', new Date().toISOString().slice(0, 10)],
    [],
    ['Metric', 'Amount (PKR)'],
    ['Net Cash Position', toExcelAmount(analytics.totalCashMinor)],
    ['Total Inflow', toExcelAmount(analytics.totalInflowMinor)],
    ['Total Outflow', toExcelAmount(analytics.totalOutflowMinor)],
    ['Net Flow', toExcelAmount(analytics.netFlowMinor)],
    ['Open Payables', toExcelAmount(analytics.totalPayableMinor)],
    ['Paid Bills', toExcelAmount(analytics.totalPaidPayableMinor)],
    ['Unallocated Advances', toExcelAmount(analytics.unallocatedAdvancesMinor)],
  ];

  const activeAccounts = data.accounts.filter((a) => !a.isArchived);
  if (activeAccounts.length > 0) {
    summaryRows.push([]);
    summaryHeaderRows.push(summaryRows.length);
    summaryRows.push(['Accounts', 'Type', 'Balance (PKR)']);
    for (const acc of activeAccounts) {
      summaryRows.push([acc.name, formatPrettyLabel(acc.type), toExcelAmount(acc.currentBalanceMinor)]);
    }
  }

  // Compute spent per project across ALL active projects (never capped to top 5 in Excel export)
  const spentByProject = new Map<string, number>();
  for (const tx of data.transactions) {
    if (tx.status === 'voided' || tx.type !== 'expense' || !tx.projectId) continue;
    spentByProject.set(tx.projectId, (spentByProject.get(tx.projectId) || 0) + (tx.amountMinor || 0));
  }
  for (const ob of data.obligations) {
    if (ob.status === 'voided' || ob.direction !== 'payable' || !ob.projectId) continue;
    spentByProject.set(ob.projectId, (spentByProject.get(ob.projectId) || 0) + (ob.totalAmountMinor || 0));
  }

  const activeProjects = data.projects.filter((p) => p.status !== 'archived');
  if (activeProjects.length > 0) {
    summaryRows.push([]);
    summaryHeaderRows.push(summaryRows.length);
    summaryRows.push(['Projects', 'Budget (PKR)', 'Spent (PKR)', 'Remaining (PKR)', 'Used %']);
    for (const prj of activeProjects) {
      const budgetMinor = prj.budgetMinor || 0;
      const spentMinor = spentByProject.get(prj.id) || 0;
      const remainingMinor = budgetMinor - spentMinor;
      const usedPct = budgetMinor > 0 ? Math.round((spentMinor * 100) / budgetMinor) : 0;
      summaryRows.push([
        prj.name,
        toExcelAmount(budgetMinor),
        toExcelAmount(spentMinor),
        toExcelAmount(remainingMinor),
        `${usedPct}%`,
      ]);
    }
  }

  const sortLatestFirst = <T extends { date?: string; createdAt?: string }>(items: T[]): T[] =>
    [...items].sort((a, b) => {
      const dateCmp = (b.date || '').localeCompare(a.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

  // 2. Expenses & Income Sheet
  const activeStandardTxs = sortLatestFirst(
    data.transactions.filter((t) => t.status !== 'voided' && t.type !== 'transfer')
  );
  const expenseIncomeRows: (string | number)[][] = [
    ['Date', 'Time', 'Type', 'Scope', 'Project', 'Account', 'Contact', 'Amount (PKR)', 'Notes'],
    ...activeStandardTxs.map((tx) => [
      tx.date || '',
      formatLocalTime12h(tx.createdAt),
      formatPrettyLabel(tx.type),
      tx.projectId ? 'Project' : 'Personal',
      tx.projectId ? projectMap.get(tx.projectId) || '' : '',
      accountMap.get(tx.accountId) || '',
      tx.contactId ? contactMap.get(tx.contactId) || '' : '',
      toExcelAmount(tx.amountMinor),
      tx.notes || '',
    ]),
  ];

  // 3. Transfers Sheet
  const activeTransfers = sortLatestFirst(
    data.transactions.filter((t) => t.status !== 'voided' && t.type === 'transfer')
  );
  const transferRows: (string | number)[][] = [
    ['Date', 'Time', 'From Account', 'To Account', 'Amount (PKR)', 'Notes'],
    ...activeTransfers.map((tx) => [
      tx.date || '',
      formatLocalTime12h(tx.createdAt),
      accountMap.get(tx.accountId) || '',
      tx.targetAccountId ? accountMap.get(tx.targetAccountId) || '' : '',
      toExcelAmount(tx.amountMinor),
      tx.notes || '',
    ]),
  ];

  // 4. Bills (Obligations) Sheet
  const activeBills = sortLatestFirst(
    data.obligations.filter((o) => o.status !== 'voided')
  );
  const billById = new Map(data.obligations.map((o) => [o.id, o]));
  const billRows: (string | number)[][] = [
    [
      'Date',
      'Time',
      'Title',
      'Type',
      'Direction',
      'Project',
      'Contact',
      'Qty',
      'Unit',
      'Unit Price (PKR)',
      'Total (PKR)',
      'Paid (PKR)',
      'Remaining (PKR)',
      'Status',
      'Paid Via',
      'Payment Breakdown',
      'Notes',
    ],
    ...activeBills.map((ob) => {
      const summary = resolveBillPaymentSummary(
        ob.id,
        data.payments,
        data.allocations,
        data.accounts
      );
      const breakdownStr = summary.installments
        .map((i) => `${i.date}: ${i.accountName} (${Money.toMajorString(i.amountMinor)})`)
        .join('; ');
      return [
        ob.date || '',
        formatLocalTime12h(ob.createdAt),
        ob.title || '',
        formatPrettyLabel(ob.type),
        ob.direction === 'receivable' ? 'Receivable' : 'Payable',
        ob.projectId ? projectMap.get(ob.projectId) || '' : 'Personal',
        ob.contactId ? contactMap.get(ob.contactId) || '' : '',
        ob.materialDetails && ob.materialDetails.quantity > 0 ? ob.materialDetails.quantity : '',
        ob.materialDetails && ob.materialDetails.quantity > 0 ? ob.materialDetails.unit : '',
        ob.materialDetails && ob.materialDetails.unitPriceMinor > 0
          ? toExcelAmount(ob.materialDetails.unitPriceMinor)
          : '',
        toExcelAmount(ob.totalAmountMinor),
        toExcelAmount(ob.allocatedAmountMinor),
        toExcelAmount(ob.remainingAmountMinor),
        formatPrettyLabel(ob.status),
        summary.accountsSummary,
        breakdownStr,
        ob.notes || '',
      ];
    }),
  ];

  // 5. Payments Sheet
  const activePayments = sortLatestFirst(
    data.payments.filter((p) => p.status !== 'voided')
  );
  const paymentRows: (string | number)[][] = [
    [
      'Date',
      'Time',
      'Direction',
      'Settlement',
      'Linked Bill',
      'Account',
      'Method',
      'Project',
      'Contact',
      'Amount (PKR)',
      'Allocated (PKR)',
      'Advance (PKR)',
      'Reference #',
      'Notes',
    ],
    ...activePayments.map((pay) => {
      const isBillPay = Boolean(pay.linkedBillId || (pay.allocatedAmountMinor || 0) > 0);
      const linkedBill = pay.linkedBillId ? billById.get(pay.linkedBillId) : undefined;
      const billTitle = pay.linkedBillTitle || linkedBill?.title || '';
      const settlementLabel = isBillPay
        ? pay.billSettlementStatus === 'partially_paid'
          ? 'Partially Paid'
          : 'Bill Paid'
        : pay.unallocatedAmountMinor > 0
          ? 'Advance'
          : 'Payment';
      const effectiveAmountMinor =
        isBillPay && (pay.allocatedAmountMinor || 0) > 0
          ? pay.allocatedAmountMinor
          : pay.amountMinor || 0;
      const effectiveAdvanceMinor = isBillPay ? 0 : pay.unallocatedAmountMinor || 0;
      return [
        pay.date || '',
        pay.time || formatLocalTime12h(pay.createdAt),
        pay.direction === 'incoming' ? 'Incoming' : 'Outgoing',
        settlementLabel,
        billTitle,
        accountMap.get(pay.accountId) || '',
        formatPrettyLabel(pay.method),
        pay.projectId ? projectMap.get(pay.projectId) || '' : 'Personal',
        pay.contactId ? contactMap.get(pay.contactId) || '' : '',
        toExcelAmount(effectiveAmountMinor),
        toExcelAmount(pay.allocatedAmountMinor),
        toExcelAmount(effectiveAdvanceMinor),
        pay.referenceNumber || '',
        pay.notes || '',
      ];
    }),
  ];

  const totalEntries =
    activeStandardTxs.length +
    activeTransfers.length +
    activeBills.length +
    activePayments.length;

  return {
    sheets: [
      { name: 'Summary', rows: summaryRows, headerRowIndices: summaryHeaderRows, titleRowIndex: 0 },
      { name: 'Expenses & Income', rows: expenseIncomeRows, headerRowIndices: [0] },
      { name: 'Transfers', rows: transferRows, headerRowIndices: [0] },
      { name: 'Bills', rows: billRows, headerRowIndices: [0] },
      { name: 'Payments', rows: paymentRows, headerRowIndices: [0] },
    ],
    totalEntries,
  };
}

async function renderStyledWorkbookBytes(sheets: ExcelSheetData[]): Promise<Uint8Array> {
  const xlsxMod = await import('xlsx-js-style');
  const XLSX = xlsxMod.default ?? xlsxMod;

  // Clean warm ledger-cream styles matching app light mode (#E2DDD5 / #D8D1C5)
  const titleStyle = {
    font: { name: 'Calibri', sz: 13, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'E2DDD5' } },
    alignment: { vertical: 'center', horizontal: 'left' },
  };

  const headerStyle = {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'D6CFC2' } },
    border: {
      top: { style: 'thin', color: { rgb: 'B8AFA0' } },
      bottom: { style: 'medium', color: { rgb: 'A89F8F' } },
    },
    alignment: { vertical: 'center', horizontal: 'left' },
  };

  const dataTextStyle = {
    font: { name: 'Calibri', sz: 10.5, color: { rgb: '1E293B' } },
    border: {
      bottom: { style: 'thin', color: { rgb: 'ECE8E1' } },
    },
    alignment: { vertical: 'center', horizontal: 'left' },
  };

  const dataNumberStyle = {
    font: { name: 'Calibri', sz: 10.5, color: { rgb: '0F172A' } },
    border: {
      bottom: { style: 'thin', color: { rgb: 'ECE8E1' } },
    },
    alignment: { vertical: 'center', horizontal: 'right' },
    numFmt: '#,##0.00',
  };

  const dataQtyStyle = {
    font: { name: 'Calibri', sz: 10.5, color: { rgb: '0F172A' } },
    border: {
      bottom: { style: 'thin', color: { rgb: 'ECE8E1' } },
    },
    alignment: { vertical: 'center', horizontal: 'right' },
    numFmt: '#,##0.##',
  };

  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    const headerSet = new Set(sheet.headerRowIndices);
    const colCount = sheet.rows.reduce((max, r) => Math.max(max, r.length), 0);

    const rowHeights: Array<{ hpt?: number }> = [];
    for (let r = 0; r < sheet.rows.length; r++) {
      const row = sheet.rows[r];
      const isTitle = sheet.titleRowIndex === r;
      const isHeader = headerSet.has(r);
      const isEmpty = row.length === 0;

      if (isTitle) rowHeights.push({ hpt: 28 });
      else if (isHeader) rowHeights.push({ hpt: 24 });
      else if (isEmpty) rowHeights.push({ hpt: 12 });
      else rowHeights.push({ hpt: 20 });

      if (isEmpty) continue;

      const spanCols = isHeader || isTitle ? Math.max(row.length, isTitle ? 2 : row.length) : row.length;
      for (let c = 0; c < spanCols; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) {
          ws[addr] = { t: 's', v: '' };
        }
        const cell = ws[addr];
        if (isTitle) {
          cell.s = titleStyle;
        } else if (isHeader) {
          const isNumericHeader =
            typeof cell.v === 'string' &&
            (cell.v.includes('(PKR)') ||
              cell.v === 'Qty' ||
              cell.v === 'Used %' ||
              cell.v === 'Share %' ||
              cell.v === 'Entries');
          cell.s = isNumericHeader
            ? { ...headerStyle, alignment: { vertical: 'center', horizontal: 'right' } }
            : headerStyle;
        } else if (typeof cell.v === 'number') {
          const colHeader = sheet.rows[sheet.headerRowIndices[0]]?.[c];
          cell.s = colHeader === 'Qty' || colHeader === 'Entries' ? dataQtyStyle : dataNumberStyle;
        } else {
          cell.s = dataTextStyle;
        }
      }
    }

    ws['!rows'] = rowHeights;

    ws['!cols'] = Array.from({ length: colCount }, (_, colIdx) => {
      let maxLen = 12;
      for (const row of sheet.rows) {
        const val = row[colIdx];
        if (val !== undefined && val !== null) {
          maxLen = Math.max(maxLen, String(val).length + 4);
        }
      }
      return { wch: Math.min(42, maxLen) };
    });

    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Uint8Array(buffer);
}

/**
 * Exports all active ledger data as a clean, styled multi-sheet Excel workbook (.xlsx)
 * using our warm light-mode ledger cream palette for clear table & heading separation.
 */
export async function exportLedgerExcel(
  userId: string
): Promise<{ rowCount: number; filename: string; outcome: FileTransferOutcome }> {
  const data = await fetchAllActiveData(userId);
  const { sheets, totalEntries } = buildLedgerWorkbookSheets(data);
  const bytes = await renderStyledWorkbookBytes(sheets);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `expense-ledger-${dateStamp}.xlsx`;

  const outcome = await triggerFileDownload(
    bytes,
    filename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  return { rowCount: totalEntries, filename, outcome };
}

/**
 * Builds 3 executive accounting statement sheets (Profit & Loss, Cash Flow, Project Costs)
 * for a given FinancialReportBundle.
 */
export function buildFinancialReportWorkbookSheets(
  report: FinancialReportBundle
): ExcelSheetData[] {
  const exportedDate = new Date().toISOString().slice(0, 10);

  // 1. Profit & Loss Sheet
  const pnlRows: (string | number)[][] = [
    ['Profit & Loss Statement', `${report.periodLabel} (${report.periodRangeLabel})`],
    ['Generated On', exportedDate],
    [],
    ['Summary Metric', 'Amount (PKR)'],
    ['Total Revenue / Income', toExcelAmount(report.pnl.totalIncomeMinor)],
    ['Direct Expenses', toExcelAmount(report.pnl.directExpenseMinor)],
    ['Bills Incurred (Accrual)', toExcelAmount(report.pnl.billsIncurredMinor)],
    ['Total Expenses', toExcelAmount(report.pnl.totalExpenseMinor)],
    ['Net Profit / (Loss)', toExcelAmount(report.pnl.netProfitMinor)],
    [
      'Profit Margin',
      report.pnl.profitMarginPct !== null ? `${report.pnl.profitMarginPct}%` : 'N/A',
    ],
  ];
  const pnlHeaderRows = [3];

  if (report.pnl.incomeLines.length > 0) {
    pnlRows.push([]);
    pnlHeaderRows.push(pnlRows.length);
    pnlRows.push(['Income Source', 'Scope', 'Entries', 'Share %', 'Amount (PKR)']);
    for (const line of report.pnl.incomeLines) {
      pnlRows.push([
        line.label,
        formatPrettyLabel(line.scope),
        line.count,
        `${line.sharePct}%`,
        toExcelAmount(line.amountMinor),
      ]);
    }
  }

  if (report.pnl.expenseLines.length > 0) {
    pnlRows.push([]);
    pnlHeaderRows.push(pnlRows.length);
    pnlRows.push(['Expense Category', 'Scope', 'Entries', 'Share %', 'Amount (PKR)']);
    for (const line of report.pnl.expenseLines) {
      pnlRows.push([
        line.label,
        formatPrettyLabel(line.scope),
        line.count,
        `${line.sharePct}%`,
        toExcelAmount(line.amountMinor),
      ]);
    }
  }

  // 2. Cash Flow Sheet
  const cfRows: (string | number)[][] = [
    ['Cash Flow Statement', `${report.periodLabel} (${report.periodRangeLabel})`],
    ['Generated On', exportedDate],
    [],
    ['Cash Flow Metric', 'Amount (PKR)'],
    ['Total Cash In', toExcelAmount(report.cashFlow.totalCashInMinor)],
    ['Total Cash Out', toExcelAmount(report.cashFlow.totalCashOutMinor)],
    ['Net Cash Movement', toExcelAmount(report.cashFlow.netCashFlowMinor)],
    ['Closing Liquid Cash', toExcelAmount(report.cashFlow.closingCashMinor)],
    ['Internal Transfers Volume (Net 0)', toExcelAmount(report.cashFlow.transferVolumeMinor)],
  ];
  const cfHeaderRows = [3];

  if (report.cashFlow.byAccount.length > 0) {
    cfRows.push([]);
    cfHeaderRows.push(cfRows.length);
    cfRows.push([
      'Account',
      'Type',
      'Cash In (PKR)',
      'Cash Out (PKR)',
      'Net Change (PKR)',
      'Current Balance (PKR)',
    ]);
    for (const acc of report.cashFlow.byAccount) {
      cfRows.push([
        acc.accountName,
        formatPrettyLabel(acc.accountType),
        toExcelAmount(acc.cashInMinor),
        toExcelAmount(acc.cashOutMinor),
        toExcelAmount(acc.netChangeMinor),
        toExcelAmount(acc.currentBalanceMinor),
      ]);
    }
  }

  // 3. Project Costs Sheet
  const prjRows: (string | number)[][] = [
    ['Project Cost Comparison', `${report.periodLabel} (${report.periodRangeLabel})`],
    ['Generated On', exportedDate],
    [],
    [
      'Project',
      'Status',
      'Budget (PKR)',
      'Direct Expenses (PKR)',
      'Bills Incurred (PKR)',
      'Total Spent (PKR)',
      'Remaining (PKR)',
      'Used %',
    ],
  ];
  for (const p of report.projectComparison.rows) {
    prjRows.push([
      p.projectName,
      formatPrettyLabel(p.status),
      toExcelAmount(p.budgetMinor),
      toExcelAmount(p.directExpenseMinor),
      toExcelAmount(p.billsIncurredMinor),
      toExcelAmount(p.totalSpentMinor),
      toExcelAmount(p.remainingMinor),
      `${p.utilizationPct}%`,
    ]);
  }
  if (report.projectComparison.rows.length > 0) {
    prjRows.push([
      'Total Portfolio',
      '',
      toExcelAmount(report.projectComparison.totalBudgetMinor),
      toExcelAmount(report.projectComparison.totalDirectMinor),
      toExcelAmount(report.projectComparison.totalBillsMinor),
      toExcelAmount(report.projectComparison.totalSpentMinor),
      toExcelAmount(report.projectComparison.totalRemainingMinor),
      `${report.projectComparison.overallUtilizationPct}%`,
    ]);
  }

  return [
    { name: 'Profit & Loss', rows: pnlRows, headerRowIndices: pnlHeaderRows, titleRowIndex: 0 },
    { name: 'Cash Flow', rows: cfRows, headerRowIndices: cfHeaderRows, titleRowIndex: 0 },
    { name: 'Project Costs', rows: prjRows, headerRowIndices: [3], titleRowIndex: 0 },
  ];
}

/**
 * Exports a styled 3-sheet executive Financial Report (.xlsx) for the chosen period.
 */
export async function exportFinancialReportExcel(
  userId: string,
  period: ReportPeriod
): Promise<{ filename: string; outcome: FileTransferOutcome }> {
  const data = await fetchAllActiveData(userId);
  const report = computeFinancialReports({
    accounts: data.accounts,
    projects: data.projects,
    transactions: data.transactions,
    obligations: data.obligations,
    payments: data.payments,
    period,
  });

  const sheets = buildFinancialReportWorkbookSheets(report);
  const bytes = await renderStyledWorkbookBytes(sheets);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `financial-report-${period}-${dateStamp}.xlsx`;

  const outcome = await triggerFileDownload(
    bytes,
    filename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  return { filename, outcome };
}

/**
 * Parses and validates a JSON backup file before planning a restore.
 */
export function parseAndValidateBackup(rawText: string): BackupValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { valid: false, totalRecords: 0, error: 'Invalid JSON file.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, totalRecords: 0, error: 'Backup file format is not recognized.' };
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    return {
      valid: false,
      totalRecords: 0,
      error: 'Unsupported backup version.',
    };
  }

  if (!obj.data || typeof obj.data !== 'object') {
    return { valid: false, totalRecords: 0, error: 'Backup file is missing data records.' };
  }

  const rawData = obj.data as Record<string, unknown>;
  const normalizedData: Record<string, unknown[]> = {};
  const counts = {} as Record<UserCollectionName, number>;
  let totalRecords = 0;

  for (const colName of USER_DATA_COLLECTIONS) {
    const rawItems = rawData[colName];
    // Backward-compatible: older v0.3.0 backups did not include optional `budgets`
    const items = rawItems === undefined && colName === 'budgets' ? [] : rawItems;
    if (!Array.isArray(items)) {
      return {
        valid: false,
        totalRecords: 0,
        error: `Backup file is missing valid "${colName}" list.`,
      };
    }

    for (const item of items) {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof (item as { id?: unknown }).id !== 'string' ||
        !(item as { id: string }).id.trim()
      ) {
        return {
          valid: false,
          totalRecords: 0,
          error: `Found a corrupted entry without an ID in "${colName}".`,
        };
      }
    }

    normalizedData[colName] = items;
    counts[colName] = items.length;
    totalRecords += items.length;
  }

  const envelope: BackupEnvelope = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: typeof obj.appVersion === 'string' ? obj.appVersion : 'unknown',
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
    counts,
    data: normalizedData as unknown as BackupDataPayload,
  };

  return { valid: true, envelope, totalRecords };
}

/**
 * Compares a validated backup against current Firestore data by ID + `updatedAt`:
 * - New or previously deleted ID (not in active collection): scheduled for import (`create`),
 *   and if listed in `deleted_records`, removes its tombstone atomically so Restore recovers lost data.
 * - Existing active ID: keeps whichever version has the latest `updatedAt`
 *   (skips if current is equal/newer; updates only if backup is strictly newer).
 * Never deletes or hard-replaces existing active data.
 */
export async function planSmartRestore(
  userId: string,
  envelope: BackupEnvelope
): Promise<SmartRestorePlan> {
  const [snapshots, deletedRegistrySnap] = await Promise.all([
    Promise.all(
      USER_DATA_COLLECTIONS.map((colName) =>
        getDocs(collection(db, 'users', userId, colName))
      )
    ),
    getDocs(collection(db, 'users', userId, DELETED_RECORDS_COLLECTION)).catch(() => ({
      docs: [] as Array<{ id: string }>,
    })),
  ]);

  const deletedRegistryIds = new Set<string>();
  deletedRegistrySnap.docs.forEach((d) => deletedRegistryIds.add(d.id));

  const localWipedAt = getLocalWipedAt(userId);
  const nowIso = new Date().toISOString();
  const safeCreatedAt =
    localWipedAt && nowIso <= localWipedAt
      ? new Date(Date.parse(localWipedAt) + 1000).toISOString()
      : nowIso;

  const byCollection = {} as Record<UserCollectionName, CollectionRestoreSummary>;
  const operations: RestoreWriteOp[] = [];
  let toImportCount = 0;
  let toUpdateCount = 0;
  let skippedCount = 0;
  let totalInBackup = 0;

  USER_DATA_COLLECTIONS.forEach((colName, idx) => {
    const existingById = new Map<string, Record<string, unknown>>();
    snapshots[idx].docs.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      const key = typeof data.id === 'string' && data.id ? data.id : docSnap.id;
      existingById.set(key, data);
    });

    const summary: CollectionRestoreSummary = { toImport: 0, toUpdate: 0, skipped: 0 };
    const backupItems = (envelope.data[colName] ?? []) as unknown as Array<Record<string, unknown>>;

    for (const rawItem of backupItems) {
      totalInBackup += 1;
      const id = String(rawItem.id).trim();
      const existing = existingById.get(id);
      const isInDeletedRegistry = deletedRegistryIds.has(id);

      const { isDeleted: _d, deletedAt: _da, ...cleanItem } = rawItem;
      const backupCreatedAt =
        typeof rawItem.createdAt === 'string' && rawItem.createdAt ? rawItem.createdAt : safeCreatedAt;
      const backupUpdatedAt = getRecordTimestamp(rawItem) || backupCreatedAt;

      // Brand-new or previously deleted object: import/recover it!
      if (!existing || existing.isDeleted === true) {
        const needsBumpedCreatedAt = localWipedAt !== null && backupCreatedAt <= localWipedAt;
        operations.push({
          colName,
          id,
          action: 'create',
          clearDeletedRegistry: isInDeletedRegistry,
          payload: {
            ...cleanItem,
            id,
            isDeleted: false,
            deletedAt: null,
            createdAt: needsBumpedCreatedAt ? safeCreatedAt : backupCreatedAt,
            updatedAt: backupUpdatedAt,
          },
        });
        summary.toImport += 1;
        toImportCount += 1;
        continue;
      }

      // Existing active record: compare `updatedAt` (Last-Updated Wins)
      const existingUpdatedAt = getRecordTimestamp(existing);
      if (backupUpdatedAt > existingUpdatedAt) {
        // Preserve immutable `createdAt` from existing Firestore doc to satisfy firestore.rules
        const immutableCreatedAt =
          typeof existing.createdAt === 'string' && existing.createdAt
            ? existing.createdAt
            : backupCreatedAt;

        operations.push({
          colName,
          id,
          action: 'update',
          clearDeletedRegistry: isInDeletedRegistry,
          payload: {
            ...cleanItem,
            id,
            isDeleted: false,
            deletedAt: null,
            createdAt: immutableCreatedAt,
            updatedAt: backupUpdatedAt,
          },
        });
        summary.toUpdate += 1;
        toUpdateCount += 1;
      } else {
        // Same ID and current version is equal or newer -> skip
        summary.skipped += 1;
        skippedCount += 1;
      }
    }

    byCollection[colName] = summary;
  });

  return {
    toImportCount,
    toUpdateCount,
    skippedCount,
    totalInBackup,
    byCollection,
    operations,
  };
}

/**
 * Executes a planned smart restore in parallel Firestore writeBatches (<= 450 ops/batch).
 * Atomically removes `deleted_records/{id}` tombstones for recovered items in the same batch.
 */
export async function executeSmartRestore(
  userId: string,
  plan: SmartRestorePlan
): Promise<{ importedCount: number; updatedCount: number; skippedCount: number }> {
  if (plan.operations.length === 0) {
    return { importedCount: 0, updatedCount: 0, skippedCount: plan.skippedCount };
  }

  const recoveredIds: string[] = [];
  const commitPromises: Promise<void>[] = [];

  let currentBatch = writeBatch(db);
  let opsInBatch = 0;

  for (const op of plan.operations) {
    const neededOps = op.clearDeletedRegistry ? 2 : 1;
    if (opsInBatch + neededOps > FIRESTORE_BATCH_LIMIT) {
      commitPromises.push(currentBatch.commit());
      currentBatch = writeBatch(db);
      opsInBatch = 0;
    }

    if (op.clearDeletedRegistry) {
      const registryRef = doc(db, 'users', userId, DELETED_RECORDS_COLLECTION, op.id);
      currentBatch.delete(registryRef);
      recoveredIds.push(op.id);
      opsInBatch += 1;
    }

    const ref = doc(db, 'users', userId, op.colName, op.id);
    currentBatch.set(ref, stripUndefinedFields(op.payload));
    opsInBatch += 1;
  }

  if (opsInBatch > 0) {
    commitPromises.push(currentBatch.commit());
  }

  await Promise.all(commitPromises);
  removeLocalDeletedIds(userId, recoveredIds);
  clearAllMemoryCaches();

  return {
    importedCount: plan.toImportCount,
    updatedCount: plan.toUpdateCount,
    skippedCount: plan.skippedCount,
  };
}
