import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowDown, RotateCw, Check } from 'lucide-react';
import { useSync } from '@/app/providers/SyncProvider';

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh?: () => Promise<void>;
  scrollContainerRef?: React.MutableRefObject<HTMLDivElement | null>;
  autoRefreshRef?: React.MutableRefObject<(() => void) | null>;
}

const PULL_THRESHOLD = 64; // px needed to engage refresh trigger
const MAX_PULL = 96; // max travel distance with elastic rubber-band damping
const REFRESH_HEIGHT = 72; // px height held while actively refreshing

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  children,
  onRefresh,
  scrollContainerRef,
  autoRefreshRef,
}) => {
  const { triggerManualRefresh, isRefreshing } = useSync();
  const [pullDistance, setPullDistanceState] = useState<number>(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  // Finger-driven motion bypasses React: position/opacity/scale are written straight to the DOM
  // (GPU transforms only, no layout), so dragging tracks the finger at full frame rate.
  // React state is kept only for the icon / label / ring details.
  const setPullDistance = useCallback((d: number) => {
    const dragging = isDraggingRef.current;
    const ease = 'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease-out';
    const content = contentRef.current;
    if (content) {
      content.style.transition = dragging ? 'none' : ease;
      content.style.transform = d > 0 ? `translate3d(0, ${d}px, 0)` : '';
    }
    const ind = indicatorRef.current;
    if (ind) {
      const p = Math.min(1, d / PULL_THRESHOLD);
      ind.style.transition = dragging ? 'none' : ease;
      // Rides just above the content's top edge (bottom-anchored), fading in only once it is
      // fully below the status-bar safe area, then sits with equal breathing room above and below.
      ind.style.opacity = d > 34 ? String(Math.min(1, (d - 34) / 22)) : '0';
      ind.style.transform = `translate3d(0, ${d}px, 0) scale(${0.7 + 0.3 * p})`;
    }
    setPullDistanceState(d);
  }, []);
  const [pullStatus, setPullStatus] = useState<'idle' | 'pulling' | 'threshold' | 'refreshing' | 'complete'>('idle');
  // Keeps the green check visible while the indicator slides back up after a finished refresh
  const [closingComplete, setClosingComplete] = useState<boolean>(false);
  const [isAutoPull, setIsAutoPull] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const startYRef = useRef<number>(0);
  const startXRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const pullDistanceRef = useRef<number>(0);
  const pullStatusRef = useRef<'idle' | 'pulling' | 'threshold' | 'refreshing' | 'complete'>('idle');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const setContainerNode = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (scrollContainerRef) {
        scrollContainerRef.current = node;
      }
    },
    [scrollContainerRef]
  );

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
        setClosingComplete(true); setPullStatus('idle'); setTimeout(() => setClosingComplete(false), 340);
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
      
      // Completely disable app pull-to-refresh if any modal dialog is currently open
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('.fixed.z-50, [role="dialog"], [data-modal]') || document.querySelector('.fixed.z-50')) {
        return;
      }

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

      // If a modal opened or user is inside a modal, cancel pull immediately
      if (document.querySelector('.fixed.z-50')) {
        isDraggingRef.current = false;
        setIsDragging(false);
        setPullDistance(0);
        setPullStatus('idle');
        return;
      }

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

  const autoPullTimerRef = useRef<number | null>(null);

  const triggerAutoPullRefresh = useCallback(() => {
    if (isRefreshing || pullStatusRef.current !== 'idle' || isDraggingRef.current) return;
    if (document.querySelector('.fixed.z-50')) return;

    if (autoPullTimerRef.current !== null) {
      window.clearTimeout(autoPullTimerRef.current);
    }

    // Phase 1: Smoothly glide down showing the pull-down arrow indicator (no pull/release prompt text)
    setIsAutoPull(true);
    setPullStatus('pulling');
    setPullDistance(PULL_THRESHOLD);
    pullDistanceRef.current = PULL_THRESHOLD;

    // Phase 2: Transition into the loading spinner -> green tick -> smooth close
    autoPullTimerRef.current = window.setTimeout(() => {
      autoPullTimerRef.current = null;
      setIsAutoPull(false);
      handleRefresh();
    }, 240);
  }, [handleRefresh, isRefreshing, setPullDistance]);

  useEffect(() => {
    if (autoRefreshRef) {
      autoRefreshRef.current = triggerAutoPullRefresh;
    }
    return () => {
      if (autoRefreshRef) {
        autoRefreshRef.current = null;
      }
    };
  }, [autoRefreshRef, triggerAutoPullRefresh]);

  useEffect(() => {
    return () => {
      if (autoPullTimerRef.current !== null) {
        window.clearTimeout(autoPullTimerRef.current);
      }
    };
  }, []);

  // Synchronize when external refresh is triggered (e.g. from top header sync button)
  useEffect(() => {
    if (isRefreshing && pullStatus !== 'refreshing') {
      setPullStatus('refreshing');
      setPullDistance(REFRESH_HEIGHT);
      pullDistanceRef.current = REFRESH_HEIGHT;
    } else if (!isRefreshing && pullStatus === 'refreshing') {
      setPullStatus('complete');
      setTimeout(() => {
        setClosingComplete(true); setPullStatus('idle'); setTimeout(() => setClosingComplete(false), 340);
        setPullDistance(0);
        pullDistanceRef.current = 0;
      }, 300);
    }
  }, [isRefreshing, pullStatus]);

  const progress = Math.min(1, pullDistance / PULL_THRESHOLD);
  const isBusy = pullStatus === 'refreshing';
  const showComplete = pullStatus === 'complete' || (closingComplete && pullStatus === 'idle');
  const RING_R = 12;
  const RING_C = 2 * Math.PI * RING_R;

  return (
    <div 
      ref={setContainerNode}
      className="relative flex-1 w-full overflow-y-auto scroll-container overscroll-y-contain select-none"
    >
      {/* Status-bar safe area (scrolls away with the content, never covered by the indicator) */}
      <div
        className="w-full pointer-events-none"
        style={{ height: 'var(--top-spacer, env(safe-area-inset-top, 0px))' }}
      />

      {/* Pull indicator: lives in the gap revealed BELOW the status bar, centered in that gap */}
      <div
        className="pointer-events-none absolute left-0 right-0 z-20"
        style={{
          top: 'var(--top-spacer, env(safe-area-inset-top, 0px))',
          height: 0,
          // Clip anything above the safe-area line so the indicator never slides under the status bar
          clipPath: 'inset(0 0 -240px 0)',
        }}
        aria-hidden={pullStatus === 'idle'}
      >
        <div
          ref={indicatorRef}
          className="absolute left-0 right-0 bottom-2.5 flex flex-col items-center justify-center gap-1 will-change-transform"
          style={{ opacity: 0, transformOrigin: '50% 100%' }}
        >
          <div className="relative w-9 h-9 rounded-full bg-[var(--lg-glass)] backdrop-blur-xl border border-[var(--lg-edge)] shadow-lg flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36" fill="none">
              <circle cx="18" cy="18" r={RING_R} stroke="currentColor" strokeWidth="2.5" className="text-[var(--lg-muted)] opacity-25" />
              <circle
                cx="18"
                cy="18"
                r={RING_R}
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className={showComplete ? 'text-emerald-500' : 'text-blue-500'}
                strokeDasharray={RING_C}
                strokeDashoffset={
                  showComplete ? 0 : isBusy ? RING_C * 0.7 : RING_C * (1 - progress)
                }
                style={{
                  transition: 'stroke-dashoffset 0.25s ease-out',
                  ...(isBusy ? { transformOrigin: '50% 50%', animation: 'spin 0.9s linear infinite' } : {}),
                }}
              />
            </svg>
            {showComplete ? (
              <Check className="w-4 h-4 text-emerald-500 stroke-[2.5]" />
            ) : isBusy ? (
              <RotateCw className="w-3.5 h-3.5 text-blue-500 opacity-0" />
            ) : (
              <ArrowDown
                className="w-4 h-4 text-blue-500"
                style={{
                  transform: `rotate(${pullStatus === 'threshold' ? 180 : progress * 180}deg)`,
                  transition: isDragging ? 'transform 0.12s ease-out' : 'transform 0.2s ease-out',
                }}
              />
            )}
          </div>
          <span
            className="h-[13px] text-[11px] font-semibold text-[var(--lg-muted)] leading-[13px] transition-opacity duration-200"
            style={{ opacity: pullDistance >= 56 && (!isAutoPull || isBusy || showComplete) ? 1 : 0 }}
          >
              {pullStatus === 'refreshing'
                ? 'Updating…'
                : showComplete
                  ? 'Updated'
                  : isAutoPull
                    ? ''
                    : pullStatus === 'threshold'
                      ? 'Release to refresh'
                      : 'Pull to refresh'}
            </span>
        </div>
      </div>

      {/* Main Content: translated directly by setPullDistance (see above) */}
      <div ref={contentRef} className="will-change-transform">
        {children}
      </div>
    </div>
  );
};
