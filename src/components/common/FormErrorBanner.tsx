import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface FormErrorBannerProps {
  error: string | null;
  onDismiss: () => void;
  autoHideMs?: number;
}

const ANIMATION_MS = 240;

/**
 * Shared form validation error card (consistent rose tint across all modals)
 * with silky single-stage slide-in entrance, 3-second visibility, and reverse slide-out exit.
 * Stays mounted at 0px height when hidden so parent flex/space-y layouts never double-jump.
 */
export const FormErrorBanner: React.FC<FormErrorBannerProps> = ({
  error,
  onDismiss,
  autoHideMs = 3000,
}) => {
  const [renderedError, setRenderedError] = useState<string | null>(error);
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    if (!error) {
      setVisible(false);
      const cleanup = window.setTimeout(() => setRenderedError(null), ANIMATION_MS);
      return () => window.clearTimeout(cleanup);
    }

    setRenderedError(error);
    let hideTimer: number | undefined;
    let dismissTimer: number | undefined;

    const rafId = window.requestAnimationFrame(() => {
      setVisible(true);
    });

    hideTimer = window.setTimeout(() => {
      setVisible(false);
      dismissTimer = window.setTimeout(() => {
        onDismiss();
      }, ANIMATION_MS);
    }, autoHideMs);

    return () => {
      window.cancelAnimationFrame(rafId);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      if (dismissTimer !== undefined) window.clearTimeout(dismissTimer);
    };
  }, [error, autoHideMs, onDismiss]);

  return (
    <div
      aria-hidden={!visible}
      className={`grid transition-[grid-template-rows,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        visible
          ? 'grid-rows-[1fr] opacity-100 translate-y-0'
          : 'grid-rows-[0fr] opacity-0 -translate-y-2 pointer-events-none'
      }`}
    >
      <div className="overflow-hidden">
        {renderedError && (
          <div className="pb-3.5">
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{renderedError}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
