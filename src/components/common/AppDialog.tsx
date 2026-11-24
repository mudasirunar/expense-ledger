import React, { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from 'glisse';
import { ModalPortal } from '@/components/common/ModalPortal';

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
  { iconBox: string; tint: string }
> = {
  default: {
    iconBox: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
    tint: '#2563EB',
  },
  danger: {
    iconBox: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20',
    tint: '#DC2626',
  },
  warning: {
    iconBox: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
    tint: '#D97706',
  },
  success: {
    iconBox: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    tint: '#059669',
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

  useEffect(() => {
    if (!isOpen) return;

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
      window.removeEventListener('keydown', handleKeyDown);
      overlayEl?.removeEventListener('touchmove', preventBackgroundScroll);
      overlayEl?.removeEventListener('wheel', preventBackgroundScroll);
    };
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  return (
    <ModalPortal isOpen={isOpen}>
      <div
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 touch-none overscroll-none animate-fade-in"
      >
        {/* Full-Screen Dimmed Blur Backdrop */}
        <div
          className="fixed inset-0 bg-black/20 dark:bg-black/60 backdrop-blur-sm touch-none"
          onClick={() => {
            if (closeOnBackdrop && !isLoading) {
              onClose();
            }
          }}
        />

        {/* Unified Modal Surface (matches QuickAdd / Projects / Contacts / Accounts modals) */}
        <div className="relative z-10 w-full max-w-[340px] sm:max-w-sm max-h-[85vh] overflow-y-auto overscroll-contain rounded-3xl p-5 sm:p-6 shadow-2xl box-border bg-[var(--lg-surface)] border border-[var(--lg-surface-edge)] backdrop-blur-2xl">
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

          {/* Action Buttons (Unified Glisse style matching Add modals) */}
          <div className="grid grid-cols-2 gap-2.5 mt-5">
            <Button
              variant="glass"
              type="button"
              onClick={onClose}
              disabled={isCancelDisabled}
              className={`!w-full !py-2.5 !rounded-[24px] font-semibold !text-sm flex items-center justify-center transition-all ${
                isCancelDisabled
                  ? '!opacity-40 !cursor-not-allowed !pointer-events-none !text-[var(--lg-muted)]'
                  : '!text-[var(--lg-foreground)]'
              }`}
            >
              {cancelLabel}
            </Button>

            <Button
              variant="filled"
              tint={styles.tint}
              type="button"
              onClick={() => onConfirm()}
              disabled={isConfirmDisabled}
              className={`!w-full !py-2.5 !rounded-[24px] font-semibold !text-sm flex items-center justify-center gap-1.5 transition-all ${
                isConfirmDisabled ? '!opacity-55 !cursor-not-allowed !pointer-events-none' : ''
              }`}
              icon={isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            >
              {isLoading && confirmLoadingLabel ? confirmLoadingLabel : confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
