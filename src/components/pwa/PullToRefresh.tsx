import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowDown, RotateCw, Check } from 'lucide-react';
import { useSync } from '@/app/providers/SyncProvider';

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh?: () => Promise<void>;
}

const PULL_THRESHOLD = 64; // px needed to engage refresh trigger
const MAX_PULL = 96; // max travel distance with elastic rubber-band damping
const REFRESH_HEIGHT = 48; // px height held while actively refreshing

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ children, onRefresh }) => {
  const { triggerManualRefresh, isRefreshing } = useSync();
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [pullStatus, setPullStatus] = useState<'idle' | 'pulling' | 'threshold' | 'refreshing' | 'complete'>('idle');
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const startYRef = useRef<number>(0);
  const startXRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const pullDistanceRef = useRef<number>(0);
  const pullStatusRef = useRef<'idle' | 'pulling' | 'threshold' | 'refreshing' | 'complete'>('idle');
  const containerRef = useRef<HTMLDivElement>(null);

  pullStatusRef.current = pullStatus;

  const handleRefresh = useCallback(async () => {
    setPullStatus('refreshing');
    setPullDistance(REFRESH_HEIGHT);
    pullDistanceRef.current = REFRESH_HEIGHT;

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
        pullDistanceRef.current = 0;
      }, 300);
    } catch {
      setPullStatus('idle');
      setPullDistance(0);
      pullDistanceRef.current = 0;
    }
  }, [onRefresh, triggerManualRefresh]);

  // Non-passive native touch event listeners eliminate iOS Safari rubber-band fighting and latency
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isHorizontalGesture = false;

    const onTouchStart = (e: TouchEvent) => {
      if (isRefreshing || pullStatusRef.current === 'refreshing') return;
      if (container.scrollTop > 1) return;

      startYRef.current = e.touches[0].clientY;
      startXRef.current = e.touches[0].clientX;
      isDraggingRef.current = true;
      setIsDragging(true);
      isHorizontalGesture = false;
      pullDistanceRef.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || isRefreshing || pullStatusRef.current === 'refreshing') return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const diffY = currentY - startYRef.current;
      const diffX = Math.abs(currentX - startXRef.current);

      if (isHorizontalGesture) return;

      // Preserve iOS Safari horizontal edge-swipe back navigation
      if (diffX > 12 && diffX > Math.abs(diffY)) {
        isHorizontalGesture = true;
        isDraggingRef.current = false;
        setIsDragging(false);
        pullDistanceRef.current = 0;
        setPullDistance(0);
        setPullStatus('idle');
        return;
      }

      // When at top of scroll and pulling downward
      if (container.scrollTop <= 0 && diffY > 0) {
        // Prevent default native scroll jitter
        if (e.cancelable) e.preventDefault();

        // Native iOS rubber-band elastic damping curve
        const damped = Math.min(MAX_PULL, (diffY * 0.52) / (1 + diffY * 0.0025));
        pullDistanceRef.current = damped;
        setPullDistance(damped);

        if (damped >= PULL_THRESHOLD) {
          if (pullStatusRef.current !== 'threshold') {
            setPullStatus('threshold');
            if (window.navigator?.vibrate) {
              try { window.navigator.vibrate(10); } catch {}
            }
          }
        } else {
          if (pullStatusRef.current !== 'pulling') {
            setPullStatus('pulling');
          }
        }
      } else {
        if (pullDistanceRef.current > 0) {
          pullDistanceRef.current = 0;
          setPullDistance(0);
          setPullStatus('idle');
        }
      }
    };

    const onTouchEnd = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);

      const finalDistance = pullDistanceRef.current;
      if (finalDistance >= PULL_THRESHOLD && pullStatusRef.current !== 'refreshing') {
        handleRefresh();
      } else {
        setPullDistance(0);
        pullDistanceRef.current = 0;
        setPullStatus('idle');
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    container.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [handleRefresh, isRefreshing]);

  // Synchronize when external refresh is triggered (e.g. from top header sync button)
  useEffect(() => {
    if (isRefreshing && pullStatus !== 'refreshing') {
      setPullStatus('refreshing');
      setPullDistance(REFRESH_HEIGHT);
      pullDistanceRef.current = REFRESH_HEIGHT;
    } else if (!isRefreshing && pullStatus === 'refreshing') {
      setPullStatus('complete');
      setTimeout(() => {
        setPullStatus('idle');
        setPullDistance(0);
        pullDistanceRef.current = 0;
      }, 300);
    }
  }, [isRefreshing, pullStatus]);

  const progress = Math.min(1, pullDistance / PULL_THRESHOLD);

  return (
    <div 
      ref={containerRef}
      className="relative flex-1 w-full overflow-y-auto scroll-container overscroll-y-contain select-none"
    >
      {/* Floating Apple Liquid Glass Pull Indicator */}
      <div 
        className="pointer-events-none absolute left-0 right-0 top-0 flex justify-center z-20 pt-2"
        style={{
          transform: `translate3d(0, ${Math.max(0, pullDistance - 40)}px, 0)`,
          opacity: pullDistance > 10 ? Math.min(1, (pullDistance - 10) / 25) : 0,
          transition: isDragging 
            ? 'none' 
            : 'transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease-out',
        }}
      >
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--lg-glass)] backdrop-blur-2xl border border-[var(--lg-edge)] shadow-lg text-xs font-semibold text-[var(--lg-foreground)]">
          {pullStatus === 'pulling' && (
            <>
              <ArrowDown 
                className="w-3.5 h-3.5 text-blue-500 transition-transform duration-75" 
                style={{ transform: `rotate(${progress * 180}deg)` }}
              />
              <span className="text-[var(--lg-muted)]">Pull to refresh</span>
            </>
          )}
          {pullStatus === 'threshold' && (
            <>
              <ArrowDown className="w-3.5 h-3.5 text-blue-500 rotate-180 transition-transform duration-150" />
              <span className="text-blue-500 font-bold">Release to refresh</span>
            </>
          )}
          {pullStatus === 'refreshing' && (
            <>
              <RotateCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
              <span>Updating ledger...</span>
            </>
          )}
          {pullStatus === 'complete' && (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[2.5]" />
              <span className="text-emerald-500 font-bold">Updated</span>
            </>
          )}
        </div>
      </div>

      {/* Main Content with Direct Hardware-Accelerated Translation */}
      <div
        style={{
          transform: `translate3d(0, ${pullDistance}px, 0)`,
          transition: isDragging 
            ? 'none' 
            : 'transform 0.26s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {children}
      </div>
    </div>
  );
};
