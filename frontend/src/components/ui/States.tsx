/**
 * États d'interface : chargement, vide, erreur, accès refusé.
 * Chaque écran de données les traite tous — jamais un « Loading… » nu.
 */
import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, Inbox, Lock, RefreshCw } from 'lucide-react';

import { Button } from './Button';
import { cn } from '@/lib/utils';
import { toMessage, toReference } from '@/services/api/errors';

// ── Squelettes ───────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden />;
}

export function SkeletonText({ lines = 3 }: { lines?: number }): JSX.Element {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={i === lines - 1 ? 'w-3/5' : 'w-full'} />
      ))}
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}): JSX.Element {
  return (
    <div className="flex flex-col" role="status" aria-label="Chargement des données">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line px-5 py-3.5">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton
              key={c}
              className={c === 0 ? 'h-4 flex-[2]' : 'h-4 flex-1'}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }): JSX.Element {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      role="status"
      aria-label="Chargement"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-lg border border-line bg-surface p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

// ── Socle commun ─────────────────────────────────────────────────

interface StateShellProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'neutral' | 'danger';
}

function StateShell({
  icon: Icon,
  title,
  description,
  action,
  tone = 'neutral',
}: StateShellProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div
        className={cn(
          'mb-4 flex size-11 items-center justify-center rounded-full',
          tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-ground text-muted',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="text-base font-medium text-ink">{title}</p>
      {description ? (
        <div className="mt-1.5 max-w-md text-sm text-slate">{description}</div>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

// ── États ────────────────────────────────────────────────────────

export function EmptyState({
  title,
  description,
  action,
  icon = Inbox,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
}): JSX.Element {
  return (
    <StateShell icon={icon} title={title} description={description} action={action} />
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}): JSX.Element {
  const message = toMessage(error);
  const reference = toReference(error);
  return (
    <StateShell
      icon={AlertTriangle}
      tone="danger"
      title={message.title}
      description={
        <>
          {message.description}
          {message.hint ? <span className="mt-1 block text-muted">{message.hint}</span> : null}
          {reference ? (
            <span className="mt-2 block font-mono text-2xs text-muted">
              réf. {reference}
            </span>
          ) : null}
        </>
      }
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw aria-hidden />
            Réessayer
          </Button>
        ) : undefined
      }
    />
  );
}

export function PermissionDenied({ what }: { what?: string }): JSX.Element {
  return (
    <StateShell
      icon={Lock}
      title="Accès refusé"
      description={
        what
          ? `Vous n'avez pas les droits nécessaires pour ${what}.`
          : "Vous n'avez pas les droits nécessaires pour consulter cette page."
      }
    />
  );
}

/**
 * Le backend ne pagine pas : au-delà de la fenêtre demandée, des éléments
 * peuvent manquer. On le dit plutôt que de laisser croire à une liste complète.
 */
export function TruncationNotice({
  shown,
  limit,
}: {
  shown: number;
  limit: number;
}): JSX.Element | null {
  if (shown < limit) return null;
  return (
    <p className="border-t border-line px-5 py-2.5 text-sm text-muted">
      Affichage limité aux {limit} éléments les plus récents. Affinez vos filtres
      pour cibler des résultats plus anciens.
    </p>
  );
}
