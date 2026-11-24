import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Glass, Button } from 'glisse';

export type SnackbarTone = 'default' | 'success' | 'error' | 'warning';
export type SnackbarPosition = 'bottom' | 'top';

export interface SnackbarAction {
  label: string;
  onClick: () => void;
}

export interface SnackbarOptions {
  message: string;
  tone?: SnackbarTone;
  durationMs?: number;
  action?: SnackbarAction;
  position?: SnackbarPosition;
}

interface SnackbarState extends SnackbarOptions {
  id: number;
  visible: boolean;
}

interface SnackbarContextType {
  showSnackbar: (options: SnackbarOptions | string) => void;
  dismissSnackbar: () => void;
}

const SnackbarContext = createContext<SnackbarContextType>({
  showSnackbar: () => {},
  dismissSnackbar: () => {},
});

export const useSnackbar = () => useContext(SnackbarContext);

const TONE_CLASSES: Record<SnackbarTone, { bar: string; actionTint?: string }> = {
  default: {
    bar: '!text-[var(--lg-foreground)]',
    actionTint: '#2563EB',
  },
  success: {
    bar: '!bg-emerald-500/15 dark:!bg-emerald-500/20 !border-emerald-500/30 !text-emerald-950 dark:!text-emerald-100',
    actionTint: '#059669',
  },
  error: {
    bar: '!bg-red-500/15 dark:!bg-red-500/20 !border-red-500/30 !text-red-950 dark:!text-red-100',
    actionTint: '#DC2626',
  },
  warning: {
    bar: '!bg-amber-500/15 dark:!bg-amber-500/20 !border-amber-500/30 !text-amber-950 dark:!text-amber-100',
    actionTint: '#D97706',
  },
};

export const SnackbarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextIdRef = useRef(1);

  const clearTimers = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
  }, []);

  const dismissSnackbar = useCallback(() => {
    clearTimers();
    setSnackbar((prev) => (prev ? { ...prev, visible: false } : null));
    cleanupTimerRef.current = setTimeout(() => {
      setSnackbar(null);
    }, 200);
  }, [clearTimers]);

  const showSnackbar = useCallback(
    (input: SnackbarOptions | string) => {
      clearTimers();
      const opts: SnackbarOptions = typeof input === 'string' ? { message: input } : input;
      const durationMs = opts.durationMs ?? 3000;
      const id = nextIdRef.current++;

      setSnackbar({
        ...opts,
        tone: opts.tone ?? 'default',
        position: opts.position ?? 'bottom',
        id,
        visible: true,
      });

      if (durationMs > 0) {
        dismissTimerRef.current = setTimeout(() => {
          dismissSnackbar();
        }, durationMs);
      }
    },
    [clearTimers, dismissSnackbar]
  );

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const toneStyle = TONE_CLASSES[snackbar?.tone ?? 'default'];
  const isTop = snackbar?.position === 'top';

  return (
    <SnackbarContext.Provider value={{ showSnackbar, dismissSnackbar }}>
      {children}
      {snackbar &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className={`fixed left-0 right-0 z-[60] flex justify-center px-4 pointer-events-none transition-[bottom,opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isTop ? 'top-4' : ''
            } ${
              snackbar.visible
                ? 'opacity-100 translate-y-0'
                : isTop
                  ? 'opacity-0 -translate-y-2'
                  : 'opacity-0 translate-y-2'
            }`}
            style={{
              // Bottom snackbars sit just above the bottom nav when one is mounted (it publishes
              // --snackbar-bottom) and fall back to the natural bottom position otherwise.
              // Changes animate smoothly via the `bottom` transition.
              bottom: isTop
                ? undefined
                : 'var(--snackbar-bottom, max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem)))',
              paddingTop: isTop ? 'env(safe-area-inset-top, 0px)' : undefined,
            }}
          >
            <Glass
              className={`pointer-events-auto max-w-md w-full sm:w-auto sm:min-w-[260px] px-4 py-3 !rounded-xl shadow-xl flex items-center justify-between gap-4 ${toneStyle.bar}`}
            >
              <span className="text-sm font-semibold leading-snug">
                {snackbar.message}
              </span>

              {snackbar.action && (
                <Button
                  variant="glass"
                  tint={toneStyle.actionTint}
                  type="button"
                  onClick={() => {
                    snackbar.action?.onClick();
                    dismissSnackbar();
                  }}
                  className="!px-3 !py-1 !rounded-full !text-xs font-bold flex-shrink-0"
                >
                  {snackbar.action.label}
                </Button>
              )}
            </Glass>
          </div>,
          document.body
        )}
    </SnackbarContext.Provider>
  );
};
