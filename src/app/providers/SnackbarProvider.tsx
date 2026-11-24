import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

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

const TONE_CLASSES: Record<SnackbarTone, { bar: string; action: string }> = {
  default: {
    bar: 'bg-slate-900/95 text-white border-white/10 dark:bg-slate-100/95 dark:text-slate-900 dark:border-black/10',
    action: 'text-blue-400 hover:text-blue-300 dark:text-blue-600 dark:hover:text-blue-700',
  },
  success: {
    bar: 'bg-emerald-950/95 text-emerald-50 border-emerald-500/25 dark:bg-emerald-900/95 dark:text-emerald-50 dark:border-emerald-400/25',
    action: 'text-emerald-300 hover:text-emerald-200',
  },
  error: {
    bar: 'bg-red-950/95 text-red-50 border-red-500/25 dark:bg-red-900/95 dark:text-red-50 dark:border-red-400/25',
    action: 'text-red-300 hover:text-red-200',
  },
  warning: {
    bar: 'bg-amber-950/95 text-amber-50 border-amber-500/25 dark:bg-amber-900/95 dark:text-amber-50 dark:border-amber-400/25',
    action: 'text-amber-300 hover:text-amber-200',
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
            className={`fixed left-0 right-0 z-[60] flex justify-center px-4 pointer-events-none transition-all duration-200 ease-out ${
              isTop ? 'top-4' : 'bottom-6'
            } ${
              snackbar.visible
                ? 'opacity-100 translate-y-0'
                : isTop
                  ? 'opacity-0 -translate-y-2'
                  : 'opacity-0 translate-y-2'
            }`}
            style={{
              paddingBottom: isTop ? undefined : 'env(safe-area-inset-bottom, 0px)',
              paddingTop: isTop ? 'env(safe-area-inset-top, 0px)' : undefined,
            }}
          >
            <div
              className={`pointer-events-auto max-w-md w-full sm:w-auto sm:min-w-[260px] px-4 py-3 rounded-2xl border shadow-xl backdrop-blur-md flex items-center justify-between gap-4 ${toneStyle.bar}`}
            >
              <span className="text-sm font-medium leading-snug">
                {snackbar.message}
              </span>

              {snackbar.action && (
                <button
                  type="button"
                  onClick={() => {
                    snackbar.action?.onClick();
                    dismissSnackbar();
                  }}
                  className={`text-sm font-bold tracking-tight flex-shrink-0 transition-colors ${toneStyle.action}`}
                >
                  {snackbar.action.label}
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </SnackbarContext.Provider>
  );
};
