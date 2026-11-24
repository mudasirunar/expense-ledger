import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/data/firebase/firestoreClient';
import { useAuth } from './AuthProvider';
import { useSnackbar } from './SnackbarProvider';
import {
  executeCloudWipe,
  getPendingCloudWipe,
  subscribeToWipeState,
} from '@/data/sync/dataWipeService';

const MONITORED_COLLECTIONS = ['projects', 'contacts', 'accounts', 'transactions'] as const;

interface SyncContextType {
  isOnline: boolean;
  pendingWritesCount: number;
  lastSyncTime: Date | null;
  triggerManualRefresh: () => Promise<void>;
  isRefreshing: boolean;
}

const SyncContext = createContext<SyncContextType>({
  isOnline: true,
  pendingWritesCount: 0,
  lastSyncTime: null,
  triggerManualRefresh: async () => {},
  isRefreshing: false,
});

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingWritesCount, setPendingWritesCount] = useState<number>(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(new Date());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Track browser online/offline state
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Show Glisse Snackbar when a new PWA Service Worker build is ready
  useEffect(() => {
    const handleNeedRefresh = (event: Event) => {
      const customEvent = event as CustomEvent<{ updateSW?: (reloadPage?: boolean) => Promise<void> }>;
      const updateSW = customEvent.detail?.updateSW;
      if (!updateSW) return;

      showSnackbar({
        message: 'New version available.',
        durationMs: 0,
        action: {
          label: 'Update',
          onClick: () => {
            updateSW(true).catch(() => window.location.reload());
          },
        },
      });
    };

    window.addEventListener('pwa:need-refresh', handleNeedRefresh);
    return () => window.removeEventListener('pwa:need-refresh', handleNeedRefresh);
  }, [showSnackbar]);

  // Monitor real-time Firestore pending local writes (`metadata.hasPendingWrites`)
  useEffect(() => {
    if (!user?.uid) {
      setPendingWritesCount(0);
      return;
    }

    const countsByCollection: Record<string, number> = {};

    const recomputeTotal = () => {
      const docsPending = Object.values(countsByCollection).reduce((sum, n) => sum + n, 0);
      const wipePending = getPendingCloudWipe(user.uid) ? 1 : 0;
      setPendingWritesCount(docsPending + wipePending);
    };

    const unsubscribers = MONITORED_COLLECTIONS.map((colName) => {
      const colRef = collection(db, 'users', user.uid, colName);
      return onSnapshot(
        colRef,
        { includeMetadataChanges: true },
        (snap) => {
          let pending = 0;
          snap.docs.forEach((docSnap) => {
            if (docSnap.metadata.hasPendingWrites) {
              pending += 1;
            }
          });
          countsByCollection[colName] = pending;
          recomputeTotal();
          if (!snap.metadata.hasPendingWrites && !snap.metadata.fromCache) {
            setLastSyncTime(new Date());
          }
        },
        () => {
          // Ignore listener errors while offline
        }
      );
    });

    recomputeTotal();

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [user?.uid, isOnline]);

  // Propagate multi-device wipe markers (`users/{uid}/meta/syncState`)
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeToWipeState(user.uid, () => {
      setLastSyncTime(new Date());
    });
  }, [user?.uid]);

  // Execute any pending offline cloud wipe automatically on reconnect
  useEffect(() => {
    if (!user?.uid || !isOnline) return;
    const pendingWipedAt = getPendingCloudWipe(user.uid);
    if (!pendingWipedAt) return;

    executeCloudWipe(user.uid, pendingWipedAt)
      .then(() => {
        setPendingWritesCount((prev) => Math.max(0, prev - 1));
        setLastSyncTime(new Date());
      })
      .catch((err) => {
        console.warn('[SyncProvider] Pending cloud wipe retry failed:', err);
      });
  }, [user?.uid, isOnline]);

  const triggerManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      if (user?.uid && navigator.onLine) {
        const pendingWipedAt = getPendingCloudWipe(user.uid);
        if (pendingWipedAt) {
          await executeCloudWipe(user.uid, pendingWipedAt);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
      setLastSyncTime(new Date());
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        pendingWritesCount,
        lastSyncTime,
        triggerManualRefresh,
        isRefreshing,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => useContext(SyncContext);
