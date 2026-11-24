import React from 'react';
import { Check } from 'lucide-react';
import { ThemeMode } from '@/app/providers/ThemeProvider';

interface ThemePreviewPickerProps {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}

const MobileScreenContent: React.FC<{ variant: 'light' | 'dark' }> = ({ variant }) => {
  const isDark = variant === 'dark';
  return (
    <div
      className={`w-full h-full p-2 flex flex-col justify-between ${
        isDark ? 'bg-[#0B0F19]' : 'bg-[#E2DDD5]'
      }`}
    >
      {/* Top status + header pills */}
      <div className="space-y-1.5">
        <div
          className={`w-6 h-1.5 rounded-full ${
            isDark ? 'bg-slate-300/70' : 'bg-slate-800/80'
          }`}
        />
        <div className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${
                isDark ? 'bg-slate-700' : 'bg-slate-400/50'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Main hero card */}
      <div
        className={`w-full flex-1 my-1.5 rounded-md p-1.5 flex flex-col justify-between ${
          isDark
            ? 'bg-slate-800/90 border border-white/10'
            : 'bg-white/90 border border-black/5'
        }`}
      >
        <div
          className={`w-8 h-1 rounded-full ${
            isDark ? 'bg-slate-600' : 'bg-slate-300'
          }`}
        />
        <div
          className={`w-11 h-2 rounded-sm ${
            isDark ? 'bg-slate-400/70' : 'bg-slate-700/70'
          }`}
        />
      </div>

      {/* Bottom 2 accent tiles + mini dock */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-1">
          <div
            className={`h-4 rounded-[4px] ${
              isDark
                ? 'bg-gradient-to-br from-rose-500/35 to-purple-500/25'
                : 'bg-gradient-to-br from-rose-300/70 to-amber-200/70'
            }`}
          />
          <div
            className={`h-4 rounded-[4px] ${
              isDark
                ? 'bg-gradient-to-br from-emerald-500/35 to-cyan-500/25'
                : 'bg-gradient-to-br from-emerald-300/70 to-sky-200/70'
            }`}
          />
        </div>
        <div
          className={`mx-auto w-9 h-1.5 rounded-full ${
            isDark ? 'bg-slate-700/90' : 'bg-white/90'
          }`}
        />
      </div>
    </div>
  );
};

const DesktopScreenContent: React.FC<{ variant: 'light' | 'dark' }> = ({ variant }) => {
  const isDark = variant === 'dark';
  return (
    <div
      className={`w-full h-full flex flex-col ${
        isDark ? 'bg-[#0B0F19]' : 'bg-[#E2DDD5]'
      }`}
    >
      {/* Window titlebar with macOS dots */}
      <div
        className={`px-2 py-1 flex items-center gap-1 border-b ${
          isDark ? 'border-white/10 bg-slate-900/70' : 'border-black/5 bg-white/50'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400/90" />
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400/90" />
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/90" />
        <div
          className={`ml-2 h-1 w-10 rounded-full ${
            isDark ? 'bg-slate-700' : 'bg-slate-400/40'
          }`}
        />
      </div>

      {/* Desktop body: sidebar + main content */}
      <div className="flex-1 flex p-1.5 gap-1.5">
        {/* Mini sidebar */}
        <div
          className={`w-6 rounded-[4px] p-1 space-y-1 ${
            isDark ? 'bg-slate-800/70' : 'bg-white/70'
          }`}
        >
          <div className={`h-1 rounded-full ${isDark ? 'bg-blue-400/70' : 'bg-blue-500/70'}`} />
          <div className={`h-1 rounded-full ${isDark ? 'bg-slate-600' : 'bg-slate-300'}`} />
          <div className={`h-1 rounded-full ${isDark ? 'bg-slate-600' : 'bg-slate-300'}`} />
        </div>

        {/* Main dashboard area */}
        <div className="flex-1 flex flex-col gap-1.5">
          <div
            className={`flex-1 rounded-[4px] p-1.5 flex flex-col justify-between ${
              isDark
                ? 'bg-slate-800/90 border border-white/10'
                : 'bg-white/90 border border-black/5'
            }`}
          >
            <div className={`w-7 h-1 rounded-full ${isDark ? 'bg-slate-600' : 'bg-slate-300'}`} />
            <div className={`w-12 h-1.5 rounded-sm ${isDark ? 'bg-slate-400/70' : 'bg-slate-700/70'}`} />
          </div>
          <div className="grid grid-cols-2 gap-1 h-4">
            <div
              className={`rounded-[3px] ${
                isDark
                  ? 'bg-gradient-to-br from-rose-500/35 to-purple-500/25'
                  : 'bg-gradient-to-br from-rose-300/70 to-amber-200/70'
              }`}
            />
            <div
              className={`rounded-[3px] ${
                isDark
                  ? 'bg-gradient-to-br from-emerald-500/35 to-cyan-500/25'
                  : 'bg-gradient-to-br from-emerald-300/70 to-sky-200/70'
              }`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const DeviceMockup: React.FC<{ mode: ThemeMode; selected: boolean }> = ({ mode, selected }) => {
  const frameRing = selected
    ? 'border-blue-500 ring-2 ring-blue-500/25'
    : 'border-slate-400/50 dark:border-slate-600/70';

  const renderInner = (isDesktop: boolean) => {
    const Screen = isDesktop ? DesktopScreenContent : MobileScreenContent;
    if (mode === 'system') {
      return (
        <div className="relative w-full h-full">
          <div
            className="absolute inset-0"
            style={{ clipPath: 'inset(0 50% 0 0)' }}
          >
            <Screen variant="light" />
          </div>
          <div
            className="absolute inset-0"
            style={{ clipPath: 'inset(0 0 0 50%)' }}
          >
            <Screen variant="dark" />
          </div>
          {/* Crisp vertical split line */}
          <div className="absolute inset-y-0 left-1/2 w-[1px] -translate-x-1/2 bg-slate-500/30 pointer-events-none" />
        </div>
      );
    }
    return <Screen variant={mode} />;
  };

  return (
    <>
      {/* Mobile Phone Mockup (< 640px) */}
      <div
        className={`sm:hidden relative w-[72px] h-[116px] rounded-[14px] border-2 overflow-hidden shadow-sm transition-all ${frameRing}`}
      >
        {renderInner(false)}
      </div>

      {/* Desktop Window Mockup (>= 640px) */}
      <div
        className={`hidden sm:block relative w-[124px] h-[82px] rounded-[10px] border-2 overflow-hidden shadow-sm transition-all ${frameRing}`}
      >
        {renderInner(true)}
      </div>
    </>
  );
};

const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

export const ThemePreviewPicker: React.FC<ThemePreviewPickerProps> = ({ value, onChange }) => {
  return (
    <div
      role="radiogroup"
      aria-label="Theme selection"
      className="grid grid-cols-3 gap-3 w-full py-1"
    >
      {OPTIONS.map(({ mode, label }) => {
        const selected = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(mode)}
            className="group flex flex-col items-center gap-2.5 py-1 rounded-xl focus:outline-none active:scale-[0.97] transition-transform"
          >
            <DeviceMockup mode={mode} selected={selected} />

            <span
              className={`text-xs font-bold tracking-tight transition-colors ${
                selected
                  ? 'text-[var(--lg-foreground)]'
                  : 'text-[var(--lg-muted)] group-hover:text-[var(--lg-foreground)]'
              }`}
            >
              {label}
            </span>

            {/* Radio / Check Circle Indicator */}
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                selected
                  ? 'bg-blue-500 text-white shadow-sm scale-105'
                  : 'border-2 border-slate-400/60 dark:border-slate-500/60 bg-transparent'
              }`}
            >
              {selected && <Check className="w-3 h-3 stroke-[3]" />}
            </span>
          </button>
        );
      })}
    </div>
  );
};
