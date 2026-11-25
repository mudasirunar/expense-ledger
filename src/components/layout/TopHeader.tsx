import React from 'react';
import { Search } from 'lucide-react';
import { Button } from 'glisse';

interface TopHeaderProps {
  title: string;
  subtitle?: string;
  onOpenSearch?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ title, subtitle, onOpenSearch }) => {
  return (
    <header className="w-full px-4 py-2.5 flex items-center justify-between gap-3 select-none">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold text-[var(--lg-foreground)] tracking-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs text-[var(--lg-muted)] font-medium truncate">{subtitle}</p>
        )}
      </div>

      {onOpenSearch && (
        <Button
          variant="glass"
          aria-label="Search ledger"
          onClick={onOpenSearch}
          icon={<Search className="w-4 h-4" />}
          className="!p-2 !rounded-full !w-9 !h-9 flex-shrink-0"
        />
      )}
    </header>
  );
};
