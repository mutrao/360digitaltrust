/** Éléments d'affichage de données : tableau, valeur monospace, pastille. */
import { useState, type ReactNode, type ThHTMLAttributes } from 'react';
import { Check, Copy } from 'lucide-react';

import { cn, copyToClipboard, hueFromString, initials } from '@/lib/utils';

// ── Tableau ──────────────────────────────────────────────────────

export function Table({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className="scroll-x">
      <table className={cn('w-full min-w-[640px] border-collapse text-left', className)}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-line px-5 py-2.5 text-2xs font-semibold uppercase tracking-wide text-muted',
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return (
    <td className={cn('border-b border-line px-5 py-3 align-middle', className)} {...props} />
  );
}

export function Tr({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}): JSX.Element {
  if (!onClick) return <tr className={className}>{children}</tr>;
  return (
    <tr
      tabIndex={0}
      role="link"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        'cursor-pointer transition-colors hover:bg-ground focus-visible:bg-ground',
        className,
      )}
    >
      {children}
    </tr>
  );
}

// ── Valeur technique copiable ────────────────────────────────────

interface MonoValueProps {
  value: string;
  /** Texte affiché s'il diffère de la valeur copiée (empreinte tronquée). */
  display?: string;
  label?: string;
  copyable?: boolean;
  className?: string;
}

export function MonoValue({
  value,
  display,
  label,
  copyable = true,
  className,
}: MonoValueProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    if (await copyToClipboard(value)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <span className={cn('inline-flex max-w-full items-center gap-1.5', className)}>
      <code
        className="truncate rounded bg-ground px-1.5 py-0.5 font-mono text-sm text-slate"
        title={value}
      >
        {display ?? value}
      </code>
      {copyable ? (
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="shrink-0 rounded p-1 text-muted transition-colors hover:text-accent"
          aria-label={copied ? 'Copié' : `Copier ${label ?? 'la valeur'}`}
        >
          {copied ? (
            <Check className="size-3.5 text-success" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
        </button>
      ) : null}
    </span>
  );
}

// ── Pastille d'identité ──────────────────────────────────────────

export function Avatar({
  name,
  size = 'md',
}: {
  name: string;
  size?: 'sm' | 'md';
}): JSX.Element {
  const hue = hueFromString(name);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white',
        size === 'sm' ? 'size-6 text-2xs' : 'size-8 text-xs',
      )}
      style={{ backgroundColor: `hsl(${hue} 42% 42%)` }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

// ── Paire libellé / valeur ───────────────────────────────────────

export function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line py-2.5 last:border-0">
      <dt className="w-44 shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-base text-ink">{children}</dd>
    </div>
  );
}
