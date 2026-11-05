import React, { createContext, useContext, useEffect, useState } from 'react';

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

  const triggerManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      setLastSyncTime(new Date());
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <SyncContext.Provider value={{
      isOnline,
      pendingWritesCount,
      lastSyncTime,
      triggerManualRefresh,
      isRefreshing
    }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => useContext(SyncContext);

