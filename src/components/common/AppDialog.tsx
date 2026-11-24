import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Glass, Button } from 'glisse';

export type AppDialogTone = 'default' | 'danger' | 'warning' | 'success';
export type AppDialogAlign = 'left' | 'center' | 'right';

export interface AppDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  iconAlign?: AppDialogAlign;
  titleAlign?: AppDialogAlign;
  descriptionAlign?: AppDialogAlign;
  tone?: AppDialogTone;
  confirmLabel?: string;
  confirmLoadingLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
  disableCancelWhileLoading?: boolean;
  disableConfirm?: boolean;
  disableCancel?: boolean;
  closeOnBackdrop?: boolean;
  children?: React.ReactNode;
}

const TONE_STYLES: Record<
  AppDialogTone,
  { iconBox: string; confirmBtn: string }
> = {
  default: {
    iconBox: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
    confirmBtn:
      '!text-blue-600 dark:!text-blue-400 !bg-blue-500/15 hover:!bg-blue-500/25 !border-blue-500/25',
  },
  danger: {
    iconBox: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20',
    confirmBtn:
      '!text-red-600 dark:!text-red-400 !bg-red-500/15 hover:!bg-red-500/25 !border-red-500/25',
  },
  warning: {
    iconBox: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
    confirmBtn:
      '!text-amber-600 dark:!text-amber-400 !bg-amber-500/15 hover:!bg-amber-500/25 !border-amber-500/25',
  },
  success: {
    iconBox: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    confirmBtn:
      '!text-emerald-600 dark:!text-emerald-400 !bg-emerald-500/15 hover:!bg-emerald-500/25 !border-emerald-500/25',
  },
};

const ALIGN_SELF: Record<AppDialogAlign, string> = {
  left: 'self-start',
  center: 'self-center',
  right: 'self-end',
};

const TEXT_ALIGN: Record<AppDialogAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

export const AppDialog: React.FC<AppDialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  icon,
  iconAlign = 'center',
  titleAlign = 'center',
  descriptionAlign = 'left',
  tone = 'default',
  confirmLabel = 'Confirm',
  confirmLoadingLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  isLoading = false,
  disableCancelWhileLoading = true,
  disableConfirm = false,
  disableCancel = false,
  closeOnBackdrop = true,
  children,
}) => {
  const isCancelDisabled = disableCancel || (isLoading && disableCancelWhileLoading);
  const isConfirmDisabled = disableConfirm || isLoading;
  const styles = TONE_STYLES[tone];
  const overlayRef = useRef<HTMLDivElement>(null);
  const [visualViewportBox, setVisualViewportBox] = useState<{
    height: number;
    offsetTop: number;
  } | null>(null);

  // Track mobile virtual keyboard via VisualViewport API so dialog stays centered above keyboard
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || !window.visualViewport) {
      setVisualViewportBox(null);
      return;
    }

    const vv = window.visualViewport;
    const syncViewport = () => {
      setVisualViewportBox({
        height: vv.height,
        offsetTop: vv.offsetTop,
      });
    };

    syncViewport();
    vv.addEventListener('resize', syncViewport);
    vv.addEventListener('scroll', syncViewport);

    return () => {
      vv.removeEventListener('resize', syncViewport);
      vv.removeEventListener('scroll', syncViewport);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };

    const preventBackgroundScroll = (e: TouchEvent | WheelEvent) => {
      const target = e.target as HTMLElement | null;
      const scrollable = target?.closest('[data-dialog-scrollable="true"]') as HTMLElement | null;
      if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
        return;
      }
      e.preventDefault();
    };

    const overlayEl = overlayRef.current;
    window.addEventListener('keydown', handleKeyDown);
    overlayEl?.addEventListener('touchmove', preventBackgroundScroll, { passive: false });
    overlayEl?.addEventListener('wheel', preventBackgroundScroll, { passive: false });

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      overlayEl?.removeEventListener('touchmove', preventBackgroundScroll);
      overlayEl?.removeEventListener('wheel', preventBackgroundScroll);
    };
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-dialog-title"
      className="fixed inset-0 z-50 touch-none overscroll-none"
    >
      {/* Full-Screen Dimmed Blur Backdrop */}
      <div
        className="fixed inset-0 bg-black/45 dark:bg-black/65 backdrop-blur-sm transition-opacity touch-none"
        onClick={() => {
          if (closeOnBackdrop && !isLoading) {
            onClose();
          }
        }}
      />

      {/* Visual-Viewport-Aware Centering Frame (lifts dialog cleanly above mobile keyboard) */}
      <div
        className="fixed left-0 right-0 z-10 flex items-center justify-center p-4 pointer-events-none transition-[height,top] duration-150 ease-out"
        style={
          visualViewportBox
            ? {
                top: `${visualViewportBox.offsetTop}px`,
                height: `${visualViewportBox.height}px`,
              }
            : {
                top: 0,
                bottom: 0,
              }
        }
      >
        {/* Glisse Liquid Glass Dialog Card */}
        <Glass className="pointer-events-auto relative w-full max-w-[330px] sm:max-w-sm max-h-full overflow-y-auto overscroll-contain rounded-3xl p-5 shadow-2xl border border-white/30 dark:border-white/15 bg-[#ECE8E1]/95 dark:bg-[#131926]/95">
          <div className="flex flex-col w-full">
            {icon && (
              <div
                className={`w-12 h-12 rounded-2xl border flex items-center justify-center mb-3.5 ${ALIGN_SELF[iconAlign]} ${styles.iconBox}`}
              >
                {icon}
              </div>
            )}

            <h2
              id="app-dialog-title"
              className={`w-full text-base font-extrabold text-[var(--lg-foreground)] tracking-tight ${TEXT_ALIGN[titleAlign]}`}
            >
              {title}
            </h2>

            {description && (
              <p className={`w-full mt-2 text-xs text-[var(--lg-muted)] leading-relaxed ${TEXT_ALIGN[descriptionAlign]}`}>
                {description}
              </p>
            )}

            {children && (
              <div className="w-full mt-4 text-left">
                {children}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5 mt-5">
            <Button
              variant="glass"
              onClick={onClose}
              disabled={isCancelDisabled}
              className={`!w-full !py-2.5 !rounded-xl font-bold !text-sm flex items-center justify-center transition-all ${
                isCancelDisabled
                  ? '!opacity-40 !cursor-not-allowed !pointer-events-none !text-[var(--lg-muted)]'
                  : '!text-[var(--lg-foreground)]'
              }`}
            >
              {cancelLabel}
            </Button>

            <Button
              variant="glass"
              onClick={() => onConfirm()}
              disabled={isConfirmDisabled}
              className={`!w-full !py-2.5 !rounded-xl font-bold !text-sm flex items-center justify-center gap-1.5 transition-all ${
                styles.confirmBtn
              } ${
                isConfirmDisabled ? '!opacity-75 !cursor-not-allowed !pointer-events-none' : ''
              }`}
              icon={isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            >
              {isLoading && confirmLoadingLabel ? confirmLoadingLabel : confirmLabel}
            </Button>
          </div>
        </Glass>
      </div>
    </div>,
    document.body
  );
};
