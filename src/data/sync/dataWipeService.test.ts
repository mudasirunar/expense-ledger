import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Firestore SDK before importing dataWipeService
const mockBatchSet = vi.fn();
const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockWriteBatch = vi.fn(() => ({
  set: mockBatchSet,
  delete: mockBatchDelete,
  commit: mockBatchCommit,
}));
const mockSetDoc = vi.fn().mockResolvedValue(undefined);
const mockGetDocs = vi.fn();
const mockOnSnapshot = vi.fn();
const mockDoc = vi.fn((_db, ...segments: string[]) => ({
  path: segments.join('/'),
}));
const mockCollection = vi.fn((_db, ...segments: string[]) => ({
  path: segments.join('/'),
}));

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...(args as [unknown, ...string[]])),
  doc: (...args: unknown[]) => mockDoc(...(args as [unknown, ...string[]])),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  writeBatch: () => mockWriteBatch(),
}));

vi.mock('@/data/firebase/firestoreClient', () => ({
  db: { __mock: true },
}));

import {
  DELETED_RECORDS_COLLECTION,
  USER_DATA_COLLECTIONS,
  isRecordActive,
  sanitizeUpdatePayload,
  setLocalWipedAt,
  getLocalWipedAt,
  getPendingCloudWipe,
  getLocalDeletedIds,
  registerMemoryCacheClearer,
  clearAllMemoryCaches,
  hardDeleteWithRegistry,
  wipeAllUserData,
  executeCloudWipe,
  subscribeToWipeState,
} from './dataWipeService';

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

describe('Delete-Wins Tombstone & Local/Remote Data Wipe Service', () => {
  const userId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: true,
      configurable: true,
    });
  });

  it('hides soft-deleted tombstones (isDeleted: true) and keeps active records', () => {
    expect(isRecordActive(userId, { isDeleted: true, createdAt: '2026-11-25T00:00:00.000Z' })).toBe(false);
    expect(isRecordActive(userId, { isDeleted: false, createdAt: '2026-11-25T00:00:00.000Z' })).toBe(true);
    expect(isRecordActive(userId, { createdAt: '2026-11-25T00:00:00.000Z' })).toBe(true);
  });

  it('strips isDeleted and deletedAt from update payloads so edits cannot resurrect tombstones', () => {
    const sanitized = sanitizeUpdatePayload({
      name: 'Updated Name',
      isDeleted: false,
      deletedAt: null,
    });
    expect(sanitized).toEqual({ name: 'Updated Name' });
    expect('isDeleted' in sanitized).toBe(false);
    expect('deletedAt' in sanitized).toBe(false);
  });

  it('enforces monotonic wipedAt locally and filters pre-wipe vs post-wipe records', () => {
    setLocalWipedAt(userId, '2026-11-25T10:00:00.000Z');
    // Older timestamp must not roll back wipedAt
    setLocalWipedAt(userId, '2026-11-24T10:00:00.000Z');

    expect(getLocalWipedAt(userId)).toBe('2026-11-25T10:00:00.000Z');
    expect(isRecordActive(userId, { createdAt: '2026-11-25T09:59:59.000Z' })).toBe(false);
    expect(isRecordActive(userId, { createdAt: '2026-11-25T10:00:00.000Z' })).toBe(false);
    expect(isRecordActive(userId, { createdAt: '2026-11-25T10:00:01.000Z' })).toBe(true);
  });

  it('clears all registered in-memory caches on wipe', () => {
    let cache: string | null = 'populated';
    const unregister = registerMemoryCacheClearer(() => {
      cache = null;
    });

    clearAllMemoryCaches();
    expect(cache).toBeNull();
    unregister();
  });

  it('online wipeAllUserData writes meta/syncState, deletes pre-wipe & tombstoned docs across all 7 collections, and keeps post-wipe docs', async () => {
    let memCache: string | null = 'stale-data';
    const unregister = registerMemoryCacheClearer(() => {
      memCache = null;
    });

    mockGetDocs.mockImplementation(async (colRef: { path: string }) => {
      if (colRef.path.endsWith('/projects')) {
        return {
          docs: [
            {
              ref: { path: `${colRef.path}/p-old` },
              data: () => ({ createdAt: '2020-01-01T00:00:00.000Z', isDeleted: false }),
            },
            {
              ref: { path: `${colRef.path}/p-tombstone` },
              data: () => ({ createdAt: '2099-01-01T00:00:00.000Z', isDeleted: true }),
            },
            {
              ref: { path: `${colRef.path}/p-future` },
              data: () => ({ createdAt: '2099-01-01T00:00:00.000Z', isDeleted: false }),
            },
          ],
        };
      }
      return { docs: [] };
    });

    const result = await wipeAllUserData(userId);

    // 1. Local state & memory cache cleared
    expect(memCache).toBeNull();
    expect(getLocalWipedAt(userId)).toBe(result.wipedAt);
    expect(getPendingCloudWipe(userId)).toBeNull();

    // 2. Remote meta/syncState written atomically inside the combined writeBatch
    expect(mockBatchSet).toHaveBeenCalledWith(
      { path: `users/${userId}/meta/syncState` },
      { wipedAt: result.wipedAt, updatedAt: result.wipedAt },
      { merge: true }
    );

    // 3. All 7 main collections + deleted_records scanned
    expect(mockGetDocs).toHaveBeenCalledTimes(USER_DATA_COLLECTIONS.length + 1);

    // 4. Only pre-wipe and tombstoned docs hard-deleted; post-wipe doc preserved
    expect(result.cloudSynced).toBe(true);
    expect(result.deletedCount).toBe(2);
    expect(mockBatchDelete).toHaveBeenCalledTimes(2);
    expect(mockBatchDelete).toHaveBeenCalledWith({ path: `users/${userId}/projects/p-old` });
    expect(mockBatchDelete).toHaveBeenCalledWith({ path: `users/${userId}/projects/p-tombstone` });
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    unregister();
  });

  it('chunks large remote deletions into <= 450-op Firestore writeBatches', async () => {
    const wipedAt = '2026-11-25T12:00:00.000Z';
    const manyDocs = Array.from({ length: 500 }, (_, i) => ({
      ref: { path: `users/${userId}/transactions/tx-${i}` },
      data: () => ({ createdAt: '2026-11-20T00:00:00.000Z' }),
    }));

    mockGetDocs.mockImplementation(async (colRef: { path: string }) => {
      if (colRef.path.endsWith('/transactions')) {
        return { docs: manyDocs };
      }
      return { docs: [] };
    });

    const deleted = await executeCloudWipe(userId, wipedAt);

    expect(deleted).toBe(500);
    expect(mockBatchDelete).toHaveBeenCalledTimes(500);
    // 450 + 50 => exactly 2 batches
    expect(mockWriteBatch).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(2);
  });

  it('offline wipeAllUserData clears local immediately, queues pending cloud wipe, and finishes remote delete on reconnect', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: false,
      configurable: true,
    });

    const offlineResult = await wipeAllUserData(userId);

    expect(offlineResult.cloudSynced).toBe(false);
    expect(offlineResult.deletedCount).toBe(0);
    expect(getLocalWipedAt(userId)).toBe(offlineResult.wipedAt);
    expect(getPendingCloudWipe(userId)).toBe(offlineResult.wipedAt);
    // Queues meta/syncState in Firestore offline persistence, does not scan remote collections while offline
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockGetDocs).not.toHaveBeenCalled();

    // Simulate reconnect
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: true,
      configurable: true,
    });
    mockGetDocs.mockImplementation(async (colRef: { path: string }) => {
      if (colRef.path.endsWith('/accounts')) {
        return {
          docs: [
            {
              ref: { path: `${colRef.path}/acc-1` },
              data: () => ({ createdAt: '2025-01-01T00:00:00.000Z' }),
            },
          ],
        };
      }
      return { docs: [] };
    });

    const pending = getPendingCloudWipe(userId)!;
    const purged = await executeCloudWipe(userId, pending);

    expect(purged).toBe(1);
    expect(getPendingCloudWipe(userId)).toBeNull();
    expect(mockBatchDelete).toHaveBeenCalledWith({ path: `users/${userId}/accounts/acc-1` });
  });

  it('subscribeToWipeState propagates a remote wipe from Device A to Device B and purges stale docs', async () => {
    let memCache: string | null = 'device-b-cache';
    const unregister = registerMemoryCacheClearer(() => {
      memCache = null;
    });

    mockGetDocs.mockResolvedValue({ docs: [] });

    let capturedCallback: ((snap: { exists: () => boolean; data: () => { wipedAt: string } }) => void) | undefined;
    mockOnSnapshot.mockImplementation((_ref, cb) => {
      capturedCallback = cb;
      return vi.fn();
    });

    const onRemoteWipe = vi.fn();
    subscribeToWipeState(userId, onRemoteWipe);

    expect(capturedCallback).toBeDefined();
    capturedCallback!({
      exists: () => true,
      data: () => ({ wipedAt: '2026-11-25T15:00:00.000Z' }),
    });

    // Wait for async executeCloudWipe inside listener
    await Promise.resolve();

    expect(getLocalWipedAt(userId)).toBe('2026-11-25T15:00:00.000Z');
    expect(memCache).toBeNull();
    expect(onRemoteWipe).toHaveBeenCalledWith('2026-11-25T15:00:00.000Z');
    expect(mockGetDocs).toHaveBeenCalled();

    unregister();
  });

  it('hardDeleteWithRegistry permanently deletes from main collection, logs to deleted_records, and hides locally', async () => {
    await hardDeleteWithRegistry(userId, 'projects', 'prj-abc', 'Tower A');

    expect(getLocalDeletedIds(userId).has('prj-abc')).toBe(true);
    expect(isRecordActive(userId, { id: 'prj-abc', createdAt: '2026-11-25T00:00:00.000Z' })).toBe(false);

    expect(mockBatchDelete).toHaveBeenCalledWith({ path: `users/${userId}/projects/prj-abc` });
    expect(mockBatchSet).toHaveBeenCalledWith(
      { path: `users/${userId}/${DELETED_RECORDS_COLLECTION}/prj-abc` },
      expect.objectContaining({
        id: 'prj-abc',
        collection: 'projects',
        name: 'Tower A',
      })
    );
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });
});
