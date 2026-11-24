import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Glass, Button } from 'glisse';

export type AppDialogTone = 'default' | 'danger' | 'warning' | 'success';

export interface AppDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
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

export const AppDialog: React.FC<AppDialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  icon,
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
      if (target?.closest('[data-dialog-scrollable="true"]')) {
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 touch-none overscroll-none"
    >
      {/* Dimmed Blur Backdrop */}
      <div
        className="absolute inset-0 bg-black/45 dark:bg-black/65 backdrop-blur-sm transition-opacity touch-none"
        onClick={() => {
          if (closeOnBackdrop && !isLoading) {
            onClose();
          }
        }}
      />

      {/* Glisse Liquid Glass Dialog Card */}
      <Glass className="relative z-10 w-full max-w-[330px] sm:max-w-sm rounded-3xl p-5 shadow-2xl border border-white/30 dark:border-white/15 bg-[#ECE8E1]/95 dark:bg-[#131926]/95">
        <div className="flex flex-col items-center text-center">
          {icon && (
            <div
              className={`w-12 h-12 rounded-2xl border flex items-center justify-center mb-3.5 ${styles.iconBox}`}
            >
              {icon}
            </div>
          )}

          <h2
            id="app-dialog-title"
            className="text-base font-extrabold text-[var(--lg-foreground)] tracking-tight"
          >
            {title}
          </h2>

          {description && (
            <p className="mt-1.5 text-xs text-[var(--lg-muted)] leading-relaxed max-w-[260px]">
              {description}
            </p>
          )}

          {children && (
            <div data-dialog-scrollable="true" className="w-full mt-4 text-left max-h-[50dvh] overflow-y-auto overscroll-contain touch-pan-y">
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
    </div>,
    document.body
  );
};
