/**
 * Small shared UI primitives so every screen uses the same quiet visual language:
 * flat surfaces, 1px lines, one accent colour, readable (≥13px) text.
 */
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import { MemoryStatus } from '../types/database';
import { STATUS_LABEL } from '../lib/memoryEngine';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'md' | 'lg' | 'sm'; block?: boolean }
> = ({ variant = 'secondary', size = 'md', block, className = '', children, ...rest }) => {
  const sizes = {
    sm: 'h-9 px-3 text-sm rounded-lg',
    md: 'h-11 px-4 text-[15px] rounded-xl',
    lg: 'h-14 px-5 text-base rounded-2xl',
  };
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-accent text-on-accent hover:bg-accent-hover font-semibold',
    secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken font-medium',
    ghost: 'text-ink-2 hover:bg-sunken font-medium',
    danger: 'bg-surface text-bad border border-line-strong hover:bg-bad-soft font-medium',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 transition-colors active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none ${sizes[size]} ${variants[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', children, ...rest }) => (
  <div className={`bg-surface border border-line rounded-2xl ${className}`} {...rest}>
    {children}
  </div>
);

export const ScreenHeader: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode }> = ({
  title,
  subtitle,
  right,
}) => (
  <header className="flex items-end justify-between gap-3 pt-6 pb-4">
    <div className="min-w-0">
      <h1 className="text-[26px] leading-tight font-bold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
    </div>
    {right && <div className="shrink-0">{right}</div>}
  </header>
);

export const SectionLabel: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="flex items-center justify-between mb-2 px-1">
    <h2 className="text-[13px] font-semibold text-muted tracking-wide">{children}</h2>
    {right}
  </div>
);

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex p-1 bg-sunken rounded-xl gap-1" role="tablist">
      {options.map(o => (
        <button
          key={String(o.value)}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg transition-colors ${size === 'sm' ? 'h-8 text-[13px]' : 'h-9 text-sm'} ${
            value === o.value ? 'bg-surface text-ink font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Chip: React.FC<{ active?: boolean; onClick?: () => void; children: React.ReactNode; title?: string }> = ({
  active,
  onClick,
  children,
  title,
}) => (
  <button
    onClick={onClick}
    title={title}
    className={`shrink-0 h-9 px-3.5 rounded-full text-sm border transition-colors whitespace-nowrap ${
      active ? 'bg-ink text-paper border-ink font-semibold' : 'bg-surface text-ink-2 border-line hover:border-line-strong'
    }`}
  >
    {children}
  </button>
);

const STATUS_DOT: Record<MemoryStatus, string> = {
  new: 'bg-line-strong',
  learning: 'bg-warn',
  retaining: 'bg-accent',
  mastered: 'bg-good',
};

export const StatusDot: React.FC<{ status: MemoryStatus }> = ({ status }) => (
  <span className={`inline-block w-2 h-2 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
);

export const StatusTag: React.FC<{ status: MemoryStatus }> = ({ status }) => (
  <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
    <StatusDot status={status} />
    {STATUS_LABEL[status]}
  </span>
);

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }> = ({
  checked,
  onChange,
  label,
  description,
}) => (
  <label className="flex items-center justify-between gap-4 py-3 cursor-pointer">
    <span className="min-w-0">
      <span className="block text-[15px] text-ink">{label}</span>
      {description && <span className="block text-[13px] text-muted mt-0.5">{description}</span>}
    </span>
    <span className="relative shrink-0">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="block w-11 h-6 rounded-full bg-line-strong peer-checked:bg-accent transition-colors" />
      <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-surface shadow transition-transform peer-checked:translate-x-5" />
    </span>
  </label>
);

/** Bottom sheet on phones, centred dialog on larger screens. */
export const Sheet: React.FC<{ title?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }> = ({
  title,
  onClose,
  children,
  footer,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div className="relative w-full max-w-md bg-paper sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col vc-enter">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="p-2 -mr-2 rounded-full text-muted hover:bg-sunken" aria-label="닫기">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 pb-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 pt-3 border-t border-line safe-bottom">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <span className="block text-[13px] font-medium text-ink-2 mb-1.5">{label}</span>
    {children}
    {hint && <span className="block text-[12px] text-muted mt-1">{hint}</span>}
  </label>
);

export const inputClass =
  'w-full h-11 px-3.5 rounded-xl bg-surface border border-line-strong text-[15px] text-ink placeholder:text-muted focus:outline-none focus:border-accent';

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', children, ...rest }) => (
  <span className={`relative block ${className}`}>
    <select
      className="w-full h-11 pl-3.5 pr-9 rounded-xl bg-surface border border-line-strong text-[15px] text-ink focus:outline-none focus:border-accent appearance-none truncate"
      {...rest}
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
  </span>
);

export const Notice: React.FC<{ tone?: 'info' | 'good' | 'bad' | 'warn'; children: React.ReactNode; onClose?: () => void }> = ({
  tone = 'info',
  children,
  onClose,
}) => {
  const tones = {
    info: 'bg-accent-soft text-ink',
    good: 'bg-good-soft text-ink',
    warn: 'bg-warn-soft text-ink',
    bad: 'bg-bad-soft text-ink',
  };
  return (
    <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${tones[tone]}`}>
      <div className="flex-1 min-w-0">{children}</div>
      {onClose && (
        <button onClick={onClose} className="text-muted -mr-1" aria-label="닫기">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

/** Big serif word, with RTL handling for Hebrew. */
export const TermText: React.FC<{ term: string; lang?: string; className?: string }> = ({ term, lang, className = '' }) => {
  const rtl = lang === 'he' || /[֐-׿]/.test(term);
  return (
    <span className={`font-serif ${className}`} dir={rtl ? 'rtl' : 'ltr'} lang={lang}>
      {term}
    </span>
  );
};
