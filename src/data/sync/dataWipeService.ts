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
] as const;

const WIPED_AT_KEY_PREFIX = 'expense_ledger_wiped_at_';
const PENDING_WIPE_KEY_PREFIX = 'expense_ledger_pending_wipe_';
const FIRESTORE_BATCH_LIMIT = 450;

// Registry for module-level UI memory caches so wipe / sign-out clears everything cleanly
const memoryCacheClearers = new Set<() => void>();

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

/**
 * Delete-Wins record filter:
 * - Hides soft-deleted tombstones (`isDeleted === true`)
 * - Hides any record created at or before the user's `wipedAt` marker
 */
export function isRecordActive<T extends SoftDeletable & { createdAt?: string }>(
  userId: string,
  record: T | null | undefined
): record is T {
  if (!record) return false;
  if (record.isDeleted === true) return false;

  const wipedAt = getLocalWipedAt(userId);
  if (wipedAt && record.createdAt && record.createdAt <= wipedAt) {
    return false;
  }

  return true;
}

/**
 * Strips tombstone fields from partial updates so normal edits
 * can never overwrite `isDeleted: true` back to `false`.
 */
export function sanitizeUpdatePayload<T extends Partial<SoftDeletable>>(
  partial: T
): Omit<T, 'isDeleted' | 'deletedAt'> {
  const { isDeleted: _d, deletedAt: _da, ...rest } = partial;
  return rest;
}

/**
 * Hard-deletes all Firestore documents created at or before `wipedAt`
 * across all 7 user collections in parallel reads + combined 450-op write batches.
 */
export async function executeCloudWipe(
  userId: string,
  wipedAt: string,
  includeMetaWrite = false
): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 0;
  }

  // Fetch all 7 collections concurrently (1 network round-trip instead of 7)
  const snapshots = await Promise.all(
    USER_DATA_COLLECTIONS.map((colName) =>
      getDocs(collection(db, 'users', userId, colName))
    )
  );

  const refsToDelete = snapshots.flatMap((snap) =>
    snap.docs
      .filter((docSnap) => {
        const data = docSnap.data() as { createdAt?: string; isDeleted?: boolean };
        if (data.isDeleted === true) return true;
        if (!data.createdAt) return true;
        return data.createdAt <= wipedAt;
      })
      .map((docSnap) => docSnap.ref)
  );

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
}

/**
 * Full offline-safe "Delete All Data" operation:
 * 1. Stamps `wipedAt` locally & clears all in-memory caches immediately.
 * 2. When online, fetches all 7 collections in parallel and commits
 *    `meta/syncState` + all deletes together in minimal write batches.
 * 3. When offline, queues `meta/syncState` in IndexedDB and finishes
 *    the cloud wipe automatically on reconnect.
 */
export async function wipeAllUserData(
  userId: string
): Promise<{ deletedCount: number; cloudSynced: boolean; wipedAt: string }> {
  const wipedAt = new Date().toISOString();

  // 1. Immediate local wipe state
  setLocalWipedAt(userId, wipedAt);
  setPendingCloudWipe(userId, wipedAt);
  clearAllMemoryCaches();

  const metaRef = doc(db, 'users', userId, 'meta', 'syncState');
  const metaPayload = { wipedAt, updatedAt: wipedAt };

  const online = typeof navigator === 'undefined' ? true : navigator.onLine;

  if (!online) {
    // Queue meta write in Firestore IndexedDB persistence without blocking offline UI
    setDoc(metaRef, metaPayload, { merge: true }).catch((err) => {
      console.warn('[DataWipe] Offline meta queue warning:', err);
    });
    return { deletedCount: 0, cloudSynced: false, wipedAt };
  }

  // 2. Online: parallel fetch + atomic combined batch write (meta/syncState + deletes)
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
        clearAllMemoryCaches();
        if (onRemoteWipe) onRemoteWipe(data.wipedAt);

        // If online, also purge any stale pre-wipe documents that may have synced from this device
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
