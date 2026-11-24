import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/data/firebase/firestoreClient';
import {
  Account,
  Allocation,
  Contact,
  Obligation,
  Payment,
  Project,
  Transaction,
} from '@/domain/entities';
import { Money } from '@/domain/accounting/money';
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

async function triggerFileDownload(content: string, filename: string, mimeType: string): Promise<void> {
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
        await navigator.share({
          files: [file],
          title: filename,
        });
        return;
      }
    } catch (err) {
      // If user explicitly cancelled the Share Sheet, don't force a fallback download
      if (err instanceof Error && err.name === 'AbortError') {
        return;
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
  };
}

/**
 * Exports all active user data as a versioned JSON backup file with full IDs and timestamps.
 */
export async function exportFullBackupJson(
  userId: string
): Promise<{ totalRecords: number; filename: string }> {
  const data = await fetchAllActiveData(userId);
  const counts: Record<UserCollectionName, number> = {
    projects: data.projects.length,
    contacts: data.contacts.length,
    accounts: data.accounts.length,
    obligations: data.obligations.length,
    payments: data.payments.length,
    allocations: data.allocations.length,
    transactions: data.transactions.length,
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
  await triggerFileDownload(JSON.stringify(envelope, null, 2), filename, 'application/json');

  return { totalRecords, filename };
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

/**
 * Builds an RFC-4180 CSV string from active ledger transactions with resolved names,
 * date + time columns, sorted latest-first by date and timestamp.
 */
export function buildTransactionsCsv(
  data: Pick<BackupDataPayload, 'transactions' | 'accounts' | 'projects' | 'contacts'>
): string {
  const accountMap = new Map(data.accounts.map((a) => [a.id, a.name]));
  const projectMap = new Map(data.projects.map((p) => [p.id, p.name]));
  const contactMap = new Map(data.contacts.map((c) => [c.id, c.name]));

  const headers = [
    'Date',
    'Time',
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

  const sorted = [...data.transactions].sort((a, b) => {
    const dateCmp = (b.date || '').localeCompare(a.date || '');
    if (dateCmp !== 0) return dateCmp;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });

  const rows = sorted.map((tx) => {
    const majorAmount = Money.toMajorString(tx.amountMinor || 0);
    return [
      tx.date || '',
      formatLocalTime(tx.createdAt),
      tx.type || '',
      tx.scope || '',
      majorAmount,
      tx.status || '',
      accountMap.get(tx.accountId) || tx.accountId || '',
      tx.targetAccountId ? accountMap.get(tx.targetAccountId) || tx.targetAccountId : '',
      tx.projectId ? projectMap.get(tx.projectId) || tx.projectId : '',
      tx.contactId ? contactMap.get(tx.contactId) || tx.contactId : '',
      tx.notes || '',
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  return [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
}

/**
 * Exports all active transactions as a spreadsheet-ready CSV file.
 */
export async function exportLedgerCsv(
  userId: string
): Promise<{ rowCount: number; filename: string }> {
  const data = await fetchAllActiveData(userId);
  const csv = buildTransactionsCsv(data);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `expense-ledger-transactions-${dateStamp}.csv`;
  await triggerFileDownload(csv, filename, 'text/csv;charset=utf-8;');

  return { rowCount: data.transactions.length, filename };
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
  const counts = {} as Record<UserCollectionName, number>;
  let totalRecords = 0;

  for (const colName of USER_DATA_COLLECTIONS) {
    const items = rawData[colName];
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

    counts[colName] = items.length;
    totalRecords += items.length;
  }

  const envelope: BackupEnvelope = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: typeof obj.appVersion === 'string' ? obj.appVersion : 'unknown',
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
    counts,
    data: rawData as unknown as BackupDataPayload,
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
    const backupItems = envelope.data[colName] as unknown as Array<Record<string, unknown>>;

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
