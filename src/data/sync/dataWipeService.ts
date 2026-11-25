import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/data/firebase/firestoreClient';
import { SoftDeletable } from '@/domain/entities';

export const USER_DATA_COLLECTIONS = [
  'projects',
  'contacts',
  'accounts',
  'obligations',
  'payments',
  'allocations',
  'transactions',
  'budgets',
] as const;

export type UserDataCollectionName = (typeof USER_DATA_COLLECTIONS)[number];

export const DELETED_RECORDS_COLLECTION = 'deleted_records';

export interface DeletedRecordEntry {
  readonly id: string;
  readonly collection: UserDataCollectionName;
  readonly name: string;
  readonly deletedAt: string;
}

const WIPED_AT_KEY_PREFIX = 'expense_ledger_wiped_at_';
const PENDING_WIPE_KEY_PREFIX = 'expense_ledger_pending_wipe_';
const DELETED_IDS_KEY_PREFIX = 'expense_ledger_deleted_ids_';
const FIRESTORE_BATCH_LIMIT = 450;

// Registry for module-level UI memory caches so wipe / sign-out clears everything cleanly
const memoryCacheClearers = new Set<() => void>();
const syncActivityListeners = new Set<(active: boolean) => void>();

export function registerMemoryCacheClearer(clearFn: () => void): () => void {
  memoryCacheClearers.add(clearFn);
  return () => {
    memoryCacheClearers.delete(clearFn);
  };
}

export function clearAllMemoryCaches(): void {
  memoryCacheClearers.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore individual cache clear errors
    }
  });
}

export function subscribeToBackgroundWipeActivity(
  listener: (active: boolean) => void
): () => void {
  syncActivityListeners.add(listener);
  return () => {
    syncActivityListeners.delete(listener);
  };
}

function notifyBackgroundWipeActivity(active: boolean): void {
  syncActivityListeners.forEach((fn) => {
    try {
      fn(active);
    } catch {
      // ignore listener errors
    }
  });
}

export function getLocalWipedAt(userId: string): string | null {
  try {
    return localStorage.getItem(`${WIPED_AT_KEY_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

export function setLocalWipedAt(userId: string, wipedAt: string): void {
  try {
    const existing = getLocalWipedAt(userId);
    if (!existing || wipedAt > existing) {
      localStorage.setItem(`${WIPED_AT_KEY_PREFIX}${userId}`, wipedAt);
    }
  } catch {
    // ignore storage errors
  }
}

export function getPendingCloudWipe(userId: string): string | null {
  try {
    return localStorage.getItem(`${PENDING_WIPE_KEY_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

function setPendingCloudWipe(userId: string, wipedAt: string): void {
  try {
    localStorage.setItem(`${PENDING_WIPE_KEY_PREFIX}${userId}`, wipedAt);
  } catch {
    // ignore storage errors
  }
}

function clearPendingCloudWipe(userId: string): void {
  try {
    localStorage.removeItem(`${PENDING_WIPE_KEY_PREFIX}${userId}`);
  } catch {
    // ignore storage errors
  }
}

// Local mirror of `deleted_records` IDs for 0ms synchronous filtering
export function getLocalDeletedIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${DELETED_IDS_KEY_PREFIX}${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function saveLocalDeletedIds(userId: string, ids: Set<string>): void {
  try {
    localStorage.setItem(`${DELETED_IDS_KEY_PREFIX}${userId}`, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore storage errors
  }
}

export function addLocalDeletedId(userId: string, id: string): void {
  const ids = getLocalDeletedIds(userId);
  ids.add(id);
  saveLocalDeletedIds(userId, ids);
}

export function removeLocalDeletedIds(userId: string, idsToRemove: string[]): void {
  if (idsToRemove.length === 0) return;
  const ids = getLocalDeletedIds(userId);
  for (const id of idsToRemove) {
    ids.delete(id);
  }
  saveLocalDeletedIds(userId, ids);
}

export function clearLocalDeletedIds(userId: string): void {
  try {
    localStorage.removeItem(`${DELETED_IDS_KEY_PREFIX}${userId}`);
  } catch {
    // ignore storage errors
  }
}

/**
 * Delete-Wins record filter:
 * - Hides any record whose `id` is in `deleted_records`
 * - Hides legacy soft-deleted tombstones (`isDeleted === true`)
 * - Hides any record created at or before the user's `wipedAt` marker
 */
export function isRecordActive<T extends SoftDeletable & { id?: string; createdAt?: string }>(
  userId: string,
  record: T | null | undefined
): record is T {
  if (!record) return false;
  if (record.isDeleted === true) return false;

  if (record.id && getLocalDeletedIds(userId).has(record.id)) {
    return false;
  }

  const wipedAt = getLocalWipedAt(userId);
  if (wipedAt && record.createdAt && record.createdAt <= wipedAt) {
    return false;
  }

  return true;
}

/**
 * Offline-first write helper:
 * Firestore writes to local IndexedDB persistence almost immediately, but its
 * returned Promise only resolves after the remote server acknowledges it (which
 * causes slow modal waits on high latency and indefinite hangs when offline).
 * This resolves as soon as either the server responds OR a brief local-commit
 * window (~120ms) elapses, while background cloud upload continues and errors
 * are still surfaced if rejected.
 */
export function awaitLocalCommit(
  writePromise: Promise<unknown>,
  onBackgroundError?: (err: unknown) => void,
  localWindowMs = 120
): Promise<void> {
  let settled = false;

  const guarded = writePromise.then(
    () => {
      settled = true;
    },
    (err) => {
      if (!settled) {
        settled = true;
        throw err;
      }
      console.error('[OfflineFirst] Background Firestore write failed:', err);
      onBackgroundError?.(err);
    }
  );

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    }, localWindowMs);

    guarded.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Recursively strips `undefined` properties because Firestore rejects `undefined` field values
 * in `setDoc()`, `updateDoc()`, and `writeBatch.set()`.
 */
export function stripUndefinedFields<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      result[key] = stripUndefinedFields(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Strips tombstone fields from partial updates so normal edits
 * can never overwrite `isDeleted: true` back to `false`.
 */
export function sanitizeUpdatePayload<T extends Partial<SoftDeletable>>(
  partial: T
): Record<string, unknown> {
  const { isDeleted: _d, deletedAt: _da, ...rest } = partial;
  return stripUndefinedFields(rest as Record<string, unknown>);
}

/**
 * Permanently hard-deletes a single document from its main Firestore collection
 * AND logs a lightweight entry in `users/{uid}/deleted_records/{id}` in one atomic batch.
 * Works offline (queued in IndexedDB) and prevents offline edits on other devices from
 * resurrecting the deleted object.
 */
export async function hardDeleteWithRegistry(
  userId: string,
  colName: UserDataCollectionName,
  id: string,
  name: string
): Promise<void> {
  const deletedAt = new Date().toISOString();
  addLocalDeletedId(userId, id);

  const batch = writeBatch(db);
  const targetRef = doc(db, 'users', userId, colName, id);
  const registryRef = doc(db, 'users', userId, DELETED_RECORDS_COLLECTION, id);

  const entry: DeletedRecordEntry = {
    id,
    collection: colName,
    name: (name || colName).slice(0, 200),
    deletedAt,
  };

  batch.delete(targetRef);
  batch.set(registryRef, entry);
  await batch.commit();
}

/**
 * Hard-deletes all Firestore documents created at or before `wipedAt`
 * across all 7 user collections PLUS clears `deleted_records` in parallel reads
 * and combined 450-op write batches.
 */
export async function executeCloudWipe(
  userId: string,
  wipedAt: string,
  includeMetaWrite = false
): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 0;
  }

  notifyBackgroundWipeActivity(true);
  try {
    // Fetch all 7 main collections + deleted_records concurrently
    // Gracefully handle deleted_records if rules are not yet published
    const [dataSnapshots, deletedRegistrySnap] = await Promise.all([
      Promise.all(
        USER_DATA_COLLECTIONS.map((colName) =>
          getDocs(collection(db, 'users', userId, colName))
        )
      ),
      getDocs(collection(db, 'users', userId, DELETED_RECORDS_COLLECTION)).catch(() => ({
        docs: [] as Array<{ ref: ReturnType<typeof doc>; data: () => Record<string, unknown> }>,
      })),
    ]);

    const refsToDelete = [
      ...dataSnapshots.flatMap((snap) =>
        snap.docs
          .filter((docSnap) => {
            const data = docSnap.data() as { createdAt?: string; isDeleted?: boolean };
            if (data.isDeleted === true) return true;
            if (!data.createdAt) return true;
            return data.createdAt <= wipedAt;
          })
          .map((docSnap) => docSnap.ref)
      ),
      ...deletedRegistrySnap.docs
        .filter((docSnap) => {
          const data = docSnap.data() as { deletedAt?: string };
          return !data.deletedAt || data.deletedAt <= wipedAt;
        })
        .map((docSnap) => docSnap.ref),
    ];

    const metaRef = doc(db, 'users', userId, 'meta', 'syncState');
    const metaPayload = { wipedAt, updatedAt: wipedAt };

    if (refsToDelete.length === 0) {
      if (includeMetaWrite) {
        await setDoc(metaRef, metaPayload, { merge: true });
      }
      clearPendingCloudWipe(userId);
      return 0;
    }

    // Pack deletes (and optional meta/syncState write) into minimal 450-op batches and commit concurrently
    const commitPromises: Promise<void>[] = [];
    for (let i = 0; i < refsToDelete.length; i += FIRESTORE_BATCH_LIMIT) {
      const chunk = refsToDelete.slice(i, i + FIRESTORE_BATCH_LIMIT);
      const batch = writeBatch(db);
      if (includeMetaWrite && i === 0) {
        batch.set(metaRef, metaPayload, { merge: true });
      }
      for (const ref of chunk) {
        batch.delete(ref);
      }
      commitPromises.push(batch.commit());
    }

    await Promise.all(commitPromises);
    clearPendingCloudWipe(userId);
    return refsToDelete.length;
  } finally {
    notifyBackgroundWipeActivity(false);
  }
}

/**
 * Full offline-safe "Delete All Data" operation:
 * 1. Stamps `wipedAt` locally, clears `deleted_ids`, & clears all in-memory caches immediately.
 * 2. When `runInBackground` is true, returns immediately so the UI dialog never blocks,
 *    while Firestore hard-deletion runs silently in the background (with amber sync ring).
 * 3. When offline, queues `meta/syncState` in IndexedDB and finishes cloud wipe on reconnect.
 */
export async function wipeAllUserData(
  userId: string,
  options?: { runInBackground?: boolean }
): Promise<{ deletedCount: number; cloudSynced: boolean; wipedAt: string }> {
  const wipedAt = new Date().toISOString();

  // 1. Immediate local wipe state
  setLocalWipedAt(userId, wipedAt);
  setPendingCloudWipe(userId, wipedAt);
  clearLocalDeletedIds(userId);
  clearAllMemoryCaches();

  const metaRef = doc(db, 'users', userId, 'meta', 'syncState');
  const metaPayload = { wipedAt, updatedAt: wipedAt };
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;

  if (!online) {
    setDoc(metaRef, metaPayload, { merge: true }).catch((err) => {
      console.warn('[DataWipe] Offline meta queue warning:', err);
    });
    return { deletedCount: 0, cloudSynced: false, wipedAt };
  }

  if (options?.runInBackground) {
    executeCloudWipe(userId, wipedAt, true).catch((err) => {
      console.warn('[DataWipe] Background cloud wipe will retry on next sync:', err);
    });
    return { deletedCount: 0, cloudSynced: false, wipedAt };
  }

  const deletedCount = await executeCloudWipe(userId, wipedAt, true);
  return { deletedCount, cloudSynced: true, wipedAt };
}

/**
 * Subscribes to `users/{uid}/meta/syncState` so wipes triggered on another device
 * immediately propagate locally and purge any late-synced pre-wipe docs.
 */
export function subscribeToWipeState(
  userId: string,
  onRemoteWipe?: (wipedAt: string) => void
): () => void {
  const metaRef = doc(db, 'users', userId, 'meta', 'syncState');
  return onSnapshot(
    metaRef,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as { wipedAt?: string };
      if (!data.wipedAt) return;

      const localWipedAt = getLocalWipedAt(userId);
      if (!localWipedAt || data.wipedAt > localWipedAt) {
        setLocalWipedAt(userId, data.wipedAt);
        clearLocalDeletedIds(userId);
        clearAllMemoryCaches();
        if (onRemoteWipe) onRemoteWipe(data.wipedAt);

        if (typeof navigator === 'undefined' || navigator.onLine) {
          executeCloudWipe(userId, data.wipedAt).catch((err) => {
            console.warn('[DataWipe] Remote wipe cleanup warning:', err);
          });
        }
      }
    },
    (err) => {
      console.warn('[DataWipe] syncState listener warning:', err);
    }
  );
}

/**
 * Subscribes to `users/{uid}/deleted_records` so individual deletes from another device
 * mirror locally immediately and keep Delete-Wins consistent across devices.
 */
export function subscribeToDeletedRecords(userId: string): () => void {
  const colRef = collection(db, 'users', userId, DELETED_RECORDS_COLLECTION);
  return onSnapshot(
    colRef,
    (snap) => {
      const ids = new Set<string>();
      snap.docs.forEach((d) => ids.add(d.id));
      saveLocalDeletedIds(userId, ids);
    },
    (err) => {
      console.warn('[DataWipe] deleted_records listener warning:', err);
    }
  );
}
