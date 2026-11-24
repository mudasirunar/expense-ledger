import React from 'react';

interface TopHeaderProps {
  title: string;
  subtitle?: string;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ title, subtitle }) => {
  return (
    <header className="w-full px-4 py-2.5 flex items-center justify-between select-none">
      <div>
        <h1 className="text-xl font-extrabold text-[var(--lg-foreground)] tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-[var(--lg-muted)] font-medium">{subtitle}</p>}
      </div>
    </header>
  );
};
