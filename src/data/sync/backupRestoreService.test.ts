import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockBatchSet = vi.fn();
const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockWriteBatch = vi.fn(() => ({
  set: mockBatchSet,
  delete: mockBatchDelete,
  commit: mockBatchCommit,
}));
const mockDoc = vi.fn((_db, ...segments: string[]) => ({
  path: segments.join('/'),
}));
const mockCollection = vi.fn((_db, ...segments: string[]) => ({
  path: segments.join('/'),
}));
const mockGetDocs = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...(args as [unknown, ...string[]])),
  doc: (...args: unknown[]) => mockDoc(...(args as [unknown, ...string[]])),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  writeBatch: () => mockWriteBatch(),
}));

vi.mock('@/data/firebase/firestoreClient', () => ({
  db: { __mock: true },
}));

import {
  buildLedgerWorkbookSheets,
  buildTransactionsCsv,
  parseAndValidateBackup,
  planSmartRestore,
  executeSmartRestore,
  BackupEnvelope,
} from './backupRestoreService';
import { setLocalWipedAt, isRecordActive } from './dataWipeService';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
}

function createValidEnvelope(overrides?: Partial<BackupEnvelope>): BackupEnvelope {
  return {
    schemaVersion: 1,
    appVersion: '0.1.0',
    exportedAt: '2026-11-25T00:00:00.000Z',
    counts: {
      projects: 2,
      contacts: 0,
      accounts: 1,
      obligations: 0,
      payments: 0,
      allocations: 0,
      transactions: 1,
    },
    data: {
      projects: [
        {
          id: 'proj-existing-newer',
          name: 'Villa A (Old Backup Name)',
          startDate: '2026-01-01',
          status: 'active',
          budgetMinor: 50000000,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-05T00:00:00.000Z',
        },
        {
          id: 'proj-new',
          name: 'Villa B (New)',
          startDate: '2026-02-01',
          status: 'active',
          budgetMinor: 30000000,
          createdAt: '2026-02-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z',
        },
      ],
      contacts: [],
      accounts: [
        {
          id: 'acc-1',
          name: 'Main Cash (Updated in Backup)',
          type: 'cash',
          openingBalanceMinor: 100000,
          currentBalanceMinor: 100000,
          isArchived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-03-10T00:00:00.000Z',
        },
      ],
      obligations: [],
      payments: [],
      allocations: [],
      transactions: [
        {
          id: 'tx-deleted',
          idempotencyKey: 'idem-1',
          type: 'expense',
          scope: 'project',
          projectId: 'proj-existing-newer',
          accountId: 'acc-1',
          amountMinor: 12550,
          date: '2026-02-10',
          notes: 'Cement, "Grade A"',
          status: 'posted',
          createdAt: '2026-02-10T00:00:00.000Z',
          updatedAt: '2026-02-10T00:00:00.000Z',
        },
      ],
    },
    ...overrides,
  };
}

describe('Smart Merge Backup, Restore & CSV Export Service', () => {
  const userId = 'user-backup-1';

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  it('validates a well-formed backup JSON and rejects invalid/corrupt files', () => {
    const valid = parseAndValidateBackup(JSON.stringify(createValidEnvelope()));
    expect(valid.valid).toBe(true);
    expect(valid.totalRecords).toBe(4);

    expect(parseAndValidateBackup('{not json').valid).toBe(false);
    expect(parseAndValidateBackup(JSON.stringify({ schemaVersion: 99, data: {} })).valid).toBe(false);

    const missingCollection = createValidEnvelope();
    // @ts-expect-error testing malformed payload
    delete missingCollection.data.accounts;
    expect(parseAndValidateBackup(JSON.stringify(missingCollection)).valid).toBe(false);
  });

  it('generates RFC-4180 escaped CSV with Record, Date, Time, latest-first sorting across transactions, bills, and payments', () => {
    const env = createValidEnvelope();
    // Add a second transaction on the same date but later timestamp to verify latest-first time sort
    env.data.transactions.push({
      id: 'tx-later',
      idempotencyKey: 'idem-2',
      type: 'income',
      scope: 'personal',
      accountId: 'acc-1',
      amountMinor: 50000,
      date: '2026-02-10',
      notes: 'Later deposit',
      status: 'posted',
      createdAt: '2026-02-10T14:30:00.000Z',
      updatedAt: '2026-02-10T14:30:00.000Z',
    });
    env.data.obligations.push({
      id: 'obl-1',
      type: 'purchase',
      direction: 'payable',
      projectId: 'proj-existing-newer',
      title: '100 Bags Cement',
      date: '2026-02-12',
      totalAmountMinor: 12000000,
      allocatedAmountMinor: 0,
      remainingAmountMinor: 12000000,
      status: 'unpaid',
      createdAt: '2026-02-12T09:00:00.000Z',
      updatedAt: '2026-02-12T09:00:00.000Z',
    });
    env.data.payments.push({
      id: 'pay-1',
      idempotencyKey: 'idem-pay-1',
      direction: 'outgoing',
      accountId: 'acc-1',
      projectId: 'proj-existing-newer',
      amountMinor: 4000000,
      allocatedAmountMinor: 4000000,
      unallocatedAmountMinor: 0,
      date: '2026-02-11',
      method: 'cash',
      status: 'posted',
      notes: 'First installment',
      createdAt: '2026-02-11T10:00:00.000Z',
      updatedAt: '2026-02-11T10:00:00.000Z',
    });

    const csv = buildTransactionsCsv(env.data);
    const lines = csv.split('\r\n');

    expect(lines[0]).toBe('Date,Time,Record,Type,Scope,Amount (PKR),Status,Account,Target Account,Project,Contact,Notes');
    // Latest-first: Feb 12 Bill -> Feb 11 Payment -> Feb 10 14:30 Income -> Feb 10 00:00 Expense
    expect(lines[1]).toMatch(/^2026-02-12,\d{2}:\d{2}:\d{2},Bill,purchase,project,120000\.00,unpaid,,,Villa A \(Old Backup Name\),,100 Bags Cement$/);
    expect(lines[2]).toMatch(/^2026-02-11,\d{2}:\d{2}:\d{2},Payment,outgoing,project,40000\.00,posted,Main Cash \(Updated in Backup\),,Villa A \(Old Backup Name\),,cash — First installment$/);
    expect(lines[3]).toMatch(/^2026-02-10,\d{2}:\d{2}:\d{2},Transaction,income,personal,500\.00,posted,Main Cash \(Updated in Backup\),,,,Later deposit$/);
    expect(lines[4]).toMatch(
      /^2026-02-10,\d{2}:\d{2}:\d{2},Transaction,expense,project,125\.50,posted,Main Cash \(Updated in Backup\),,Villa A \(Old Backup Name\),,"Cement, ""Grade A"""$/
    );
  });

  it('builds 5 clean multi-sheet Excel tables (Summary, Expenses & Income, Transfers, Bills, Payments)', () => {
    const env = createValidEnvelope();
    env.data.transactions.push({
      id: 'tx-transfer',
      idempotencyKey: 'idem-tr-1',
      type: 'transfer',
      scope: 'personal',
      accountId: 'acc-1',
      targetAccountId: 'acc-1',
      amountMinor: 25000,
      date: '2026-02-15',
      notes: 'Cash shift',
      status: 'posted',
      createdAt: '2026-02-15T10:00:00.000Z',
      updatedAt: '2026-02-15T10:00:00.000Z',
    });
    env.data.obligations.push({
      id: 'obl-1',
      type: 'purchase',
      direction: 'payable',
      projectId: 'proj-existing-newer',
      title: 'Cement',
      date: '2026-02-12',
      totalAmountMinor: 100000,
      allocatedAmountMinor: 40000,
      remainingAmountMinor: 60000,
      status: 'partially_paid',
      createdAt: '2026-02-12T09:00:00.000Z',
      updatedAt: '2026-02-12T09:00:00.000Z',
    });

    const { sheets, totalEntries } = buildLedgerWorkbookSheets(env.data);
    expect(sheets.map((s) => s.name)).toEqual([
      'Summary',
      'Expenses & Income',
      'Transfers',
      'Bills',
      'Payments',
    ]);
    expect(totalEntries).toBe(3); // 1 expense + 1 transfer + 1 bill
    // Expenses & Income sheet excludes transfers
    expect(sheets[1].rows).toHaveLength(2); // header + 1 expense
    // Transfers sheet has only transfers
    expect(sheets[2].rows).toHaveLength(2); // header + 1 transfer
    // Bills sheet has only bills with Paid/Remaining/Status
    expect(sheets[3].rows).toHaveLength(2);
    expect(sheets[3].rows[1]).toContain('Partially Paid');
  });

  it('plans smart merge: imports new & recovers previously deleted items (clearing deleted_records), skips equal/newer active IDs, and updates strictly newer backup items', async () => {
    const env = createValidEnvelope();

    mockGetDocs.mockImplementation(async (colRef: { path: string }) => {
      if (colRef.path.endsWith('/projects')) {
        return {
          docs: [
            {
              id: 'proj-existing-newer',
              data: () => ({
                id: 'proj-existing-newer',
                name: 'Villa A (Edited Later in App)',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-05-01T00:00:00.000Z', // Newer than backup's 2026-01-05
                isDeleted: false,
              }),
            },
          ],
        };
      }
      if (colRef.path.endsWith('/accounts')) {
        return {
          docs: [
            {
              id: 'acc-1',
              data: () => ({
                id: 'acc-1',
                name: 'Main Cash (Older in App)',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z', // Older than backup's 2026-03-10
                isDeleted: false,
              }),
            },
          ],
        };
      }
      if (colRef.path.endsWith('/deleted_records')) {
        return {
          docs: [
            {
              id: 'tx-deleted',
              data: () => ({
                id: 'tx-deleted',
                collection: 'transactions',
                name: 'Cement',
                deletedAt: '2026-02-11T00:00:00.000Z',
              }),
            },
          ],
        };
      }
      return { docs: [] };
    });

    const plan = await planSmartRestore(userId, env);

    // proj-new -> create (1)
    // tx-deleted -> recovered from deleted_records! (create + clear deleted_records) (1)
    // acc-1 -> update because backup updatedAt is newer (1)
    // proj-existing-newer -> skipped because current active version is newer (1)
    expect(plan.toImportCount).toBe(2);
    expect(plan.toUpdateCount).toBe(1);
    expect(plan.skippedCount).toBe(1);
    expect(plan.operations).toHaveLength(3);

    const execResult = await executeSmartRestore(userId, plan);
    expect(execResult).toEqual({ importedCount: 2, updatedCount: 1, skippedCount: 1 });
    expect(mockBatchDelete).toHaveBeenCalledWith({
      path: `users/${userId}/deleted_records/tx-deleted`,
    });
    expect(mockBatchSet).toHaveBeenCalledTimes(3);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('keeps newly imported backup records active even after a prior Delete All Data wipe', async () => {
    const env = createValidEnvelope();
    setLocalWipedAt(userId, '2026-06-01T00:00:00.000Z');
    mockGetDocs.mockResolvedValue({ docs: [] });

    const plan = await planSmartRestore(userId, env);
    expect(plan.toImportCount).toBe(4);
    expect(plan.skippedCount).toBe(0);

    await executeSmartRestore(userId, plan);
    for (const call of mockBatchSet.mock.calls) {
      const payload = call[1] as { isDeleted: boolean; createdAt: string };
      expect(payload.isDeleted).toBe(false);
      expect(isRecordActive(userId, payload)).toBe(true);
    }
  });
});
