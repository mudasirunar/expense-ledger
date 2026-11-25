import React from 'react';
import { Project, ProjectStatus } from '@/domain/entities';
import { Money } from '@/domain/accounting/money';
import { Button } from 'glisse';
import { TrendingUp, X } from 'lucide-react';
import { ModalPortal } from '@/components/common/ModalPortal';

function getStatusBadge(status: ProjectStatus): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    case 'completed':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    case 'on_hold':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
  }
}

interface ProjectDetailModalProps {
  project: Project | null;
  onClose: () => void;
}

export const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({ project, onClose }) => {
  if (!project) return null;

  return (
    <ModalPortal isOpen={Boolean(project)}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto overscroll-none"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md p-4 sm:p-6 rounded-3xl space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto box-border bg-[var(--lg-surface)] border border-[var(--lg-surface-edge)] backdrop-blur-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between">
            <div>
              <span
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getStatusBadge(project.status)}`}
              >
                {project.status.replace('_', ' ')}
              </span>
              <h3 className="text-lg font-black text-[var(--lg-foreground)] mt-1.5">
                {project.name}
              </h3>
              {project.code && (
                <span className="text-xs font-mono text-[var(--lg-muted)]">
                  Code: {project.code}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full text-[var(--lg-muted)] hover:text-[var(--lg-foreground)]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-[var(--lg-muted)]/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[var(--lg-muted)] uppercase tracking-wider font-semibold block">
                  Total Budget
                </span>
                <span className="text-base font-extrabold text-[var(--lg-foreground)] tabular-nums">
                  {Money.format(project.budgetMinor)}
                </span>
              </div>
              <TrendingUp className="w-6 h-6 text-blue-500" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-[var(--lg-muted)]/5">
                <span className="text-[10px] text-[var(--lg-muted)] uppercase tracking-wider font-semibold block">
                  Start Date
                </span>
                <span className="font-semibold text-[var(--lg-foreground)] mt-0.5 block">
                  {project.startDate}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--lg-muted)]/5">
                <span className="text-[10px] text-[var(--lg-muted)] uppercase tracking-wider font-semibold block">
                  Location
                </span>
                <span className="font-semibold text-[var(--lg-foreground)] mt-0.5 block truncate">
                  {project.location || 'Not specified'}
                </span>
              </div>
            </div>

            {project.clientName && (
              <div className="p-3 rounded-xl bg-[var(--lg-muted)]/5">
                <span className="text-[10px] text-[var(--lg-muted)] uppercase tracking-wider font-semibold block">
                  Client Name
                </span>
                <span className="font-semibold text-[var(--lg-foreground)] mt-0.5 block">
                  {project.clientName}
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button
              variant="glass"
              onClick={onClose}
              className="!text-xs font-semibold"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
