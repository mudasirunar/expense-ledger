import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowDown, Loader2, Check } from 'lucide-react';
import { useSync } from '@/app/providers/SyncProvider';

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh?: () => Promise<void>;
}

const PULL_THRESHOLD = 70; // px
const MAX_PULL = 110; // px

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ children, onRefresh }) => {
  const { triggerManualRefresh, isRefreshing } = useSync();
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [pullStatus, setPullStatus] = useState<'idle' | 'pulling' | 'threshold' | 'refreshing' | 'complete'>('idle');

  const startYRef = useRef<number>(0);
  const startXRef = useRef<number>(0);
  const isPullingRef = useRef<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleRefresh = useCallback(async () => {
    setPullStatus('refreshing');
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        await triggerManualRefresh();
      }
      setPullStatus('complete');
      setTimeout(() => {
        setPullStatus('idle');
        setPullDistance(0);
      }, 500);
    } catch {
      setPullStatus('idle');
      setPullDistance(0);
    }
  }, [onRefresh, triggerManualRefresh]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isRefreshing || pullStatus === 'refreshing') return;
    const container = containerRef.current;
    if (!container || container.scrollTop > 0) return;

    startYRef.current = e.touches[0].clientY;
    startXRef.current = e.touches[0].clientX;
    isPullingRef.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPullingRef.current || isRefreshing || pullStatus === 'refreshing') return;
    const container = containerRef.current;
    if (!container || container.scrollTop > 0) {
      isPullingRef.current = false;
      setPullDistance(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const diffY = currentY - startYRef.current;
    const diffX = Math.abs(currentX - startXRef.current);

    // If swipe is primarily horizontal, cancel pull to preserve iOS Safari edge-swipe back navigation
    if (diffX > diffY) {
      isPullingRef.current = false;
      setPullDistance(0);
      return;
    }

    if (diffY > 0) {
      const dampedDistance = Math.min(MAX_PULL, diffY * 0.5);
      setPullDistance(dampedDistance);
      if (dampedDistance >= PULL_THRESHOLD) {
        setPullStatus('threshold');
      } else {
        setPullStatus('pulling');
      }
    }
  };

  const handleTouchEnd = () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;

    if (pullDistance >= PULL_THRESHOLD && pullStatus !== 'refreshing') {
      handleRefresh();
    } else {
      setPullDistance(0);
      setPullStatus('idle');
    }
  };

  useEffect(() => {
    if (isRefreshing && pullStatus !== 'refreshing') {
      setPullStatus('refreshing');
      setPullDistance(50);
    } else if (!isRefreshing && pullStatus === 'refreshing') {
      setPullStatus('complete');
      setTimeout(() => {
        setPullStatus('idle');
        setPullDistance(0);
      }, 400);
    }
  }, [isRefreshing, pullStatus]);

  return (
    <div 
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative flex-1 w-full overflow-y-auto scroll-container overscroll-y-contain"
    >
      <div 
        style={{ height: `${pullDistance}px` }}
        className="overflow-hidden flex items-center justify-center transition-all duration-150 ease-out text-xs text-slate-400 font-medium"
      >
        {pullStatus === 'pulling' && (
          <div className="flex items-center gap-1.5 opacity-80">
            <ArrowDown className="w-4 h-4 transition-transform duration-100" />
            <span>Pull down to refresh</span>
          </div>
        )}
        {pullStatus === 'threshold' && (
          <div className="flex items-center gap-1.5 text-blue-400 font-semibold">
            <ArrowDown className="w-4 h-4 rotate-180 transition-transform duration-150" />
            <span>Release to update</span>
          </div>
        )}
        {pullStatus === 'refreshing' && (
          <div className="flex items-center gap-1.5 text-blue-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Updating financial data...</span>
          </div>
        )}
        {pullStatus === 'complete' && (
          <div className="flex items-center gap-1.5 text-emerald-400">
            <Check className="w-4 h-4" />
            <span>Up to date</span>
          </div>
        )}
      </div>

      {children}
    </div>
  );
};

