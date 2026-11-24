import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import {
  executeCloudWipe,
  getPendingCloudWipe,
  subscribeToWipeState,
} from '@/data/sync/dataWipeService';

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
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingWritesCount] = useState<number>(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(new Date());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

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
