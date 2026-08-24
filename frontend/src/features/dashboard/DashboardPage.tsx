import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileSignature,
  Plus,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Avatar, MonoValue } from '@/components/ui/Data';
import { WorkflowStatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonCards, SkeletonTable } from '@/components/ui/States';
import { useAuditLogs, useAuditStats, useWorkflows, workflowProgress } from '@/hooks/queries';
import { formatRelative, isExpired } from '@/lib/utils';
import { useAuth } from '@/services/auth/AuthProvider';
import type { AuditEntry, Workflow } from '@/types/api';

// ── Indicateurs ──────────────────────────────────────────────────

interface StatTileProps {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: 'accent' | 'warning' | 'success' | 'danger';
  to?: string;
}

const TONE: Record<StatTileProps['tone'], string> = {
  accent: 'bg-accent-soft text-accent',
  warning: 'bg-warning-soft text-warning',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
};

function StatTile({ label, value, icon: Icon, tone, to }: StatTileProps): JSX.Element {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-slate">{label}</span>
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded ${TONE[tone]}`}
          aria-hidden
        >
          <Icon className="size-3.5" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">{value}</p>
    </>
  );

  const className =
    'rounded-lg border border-line bg-surface p-5 shadow-raise transition-colors';

  return to ? (
    <Link to={to} className={`${className} block hover:border-accent/40`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

// ── Activité ─────────────────────────────────────────────────────

const EVENT_LABEL: Record<string, string> = {
  sign_hash: 'Signature apposée',
  workflow_created: 'Demande créée',
  workflow_cancelled: 'Demande annulée',
};

function ActivityRow({ entry }: { entry: AuditEntry }): JSX.Element {
  const label = EVENT_LABEL[entry.event] ?? entry.event;
  const subject = entry.document_name ?? entry.title ?? '—';
  const actor = entry.signer_id ?? entry.created_by ?? entry.cancelled_by ?? 'système';

  return (
    <li className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
      <Avatar name={actor} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base text-ink">
          <span className="font-medium">{label}</span>
          <span className="text-slate"> · {subject}</span>
        </p>
        <p className="mt-0.5 truncate text-sm text-muted">
          {actor === 'anonymous' ? 'Signataire non identifié' : actor}
        </p>
      </div>
      <span className="shrink-0 text-sm text-muted">{formatRelative(entry.timestamp)}</span>
    </li>
  );
}

// ── Demandes à traiter ───────────────────────────────────────────

function AttentionRow({ workflow }: { workflow: Workflow }): JSX.Element {
  const progress = workflowProgress(workflow);
  const expired = isExpired(workflow.expires_at);

  return (
    <li>
      <Link
        to={`/demandes/${workflow.id}`}
        className="flex items-center gap-4 border-b border-line px-5 py-3 transition-colors last:border-0 hover:bg-ground"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium text-ink">{workflow.title}</p>
          <p className="mt-0.5 truncate text-sm text-muted">
            {workflow.document_name} · {progress.signed}/{progress.required} signature
            {progress.required > 1 ? 's' : ''}
          </p>
        </div>
        <WorkflowStatusBadge status={workflow.status} expired={expired} />
        <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export function DashboardPage(): JSX.Element {
  const { principal } = useAuth();
  const stats = useAuditStats();
  const workflows = useWorkflows();
  const activity = useAuditLogs({ limit: 8 });

  const all = workflows.data?.workflows ?? [];
  const pending = all.filter((w) => w.status === 'pending' && !isExpired(w.expires_at));
  const completed = all.filter((w) => w.status === 'completed');
  const expired = all.filter((w) => w.status === 'pending' && isExpired(w.expires_at));

  const greeting = principal?.displayName
    ? `Bonjour ${principal.displayName.split(' ')[0]}`
    : 'Tableau de bord';

  return (
    <>
      <PageHeader
        title={greeting}
        description="Suivi de vos demandes de signature et de l'activité de la plateforme."
        actions={
          <Button variant="primary" asChild>
            <Link to="/demandes/nouvelle">
              <Plus aria-hidden />
              Nouvelle demande
            </Link>
          </Button>
        }
      />

      {/* Indicateurs */}
      {workflows.isLoading || stats.isLoading ? (
        <SkeletonCards />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="En attente de signature"
            value={pending.length}
            icon={Clock}
            tone="warning"
            to="/demandes?statut=pending"
          />
          <StatTile
            label="Demandes finalisées"
            value={completed.length}
            icon={CheckCircle2}
            tone="success"
            to="/demandes?statut=completed"
          />
          <StatTile
            label="Signatures apposées"
            value={stats.data?.total_signatures ?? 0}
            icon={ShieldCheck}
            tone="accent"
          />
          <StatTile
            label="Demandes expirées"
            value={expired.length}
            icon={XCircle}
            tone={expired.length > 0 ? 'danger' : 'accent'}
          />
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-5">
        {/* Demandes nécessitant une action */}
        <Card className="lg:col-span-3">
          <CardHeader
            title="Nécessite votre attention"
            description="Demandes en attente d'au moins une signature"
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/demandes">
                  Tout voir
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            }
          />
          {workflows.isLoading ? (
            <SkeletonTable rows={4} cols={3} />
          ) : workflows.isError ? (
            <ErrorState error={workflows.error} onRetry={() => void workflows.refetch()} />
          ) : pending.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Rien en attente"
              description="Toutes vos demandes de signature sont à jour."
              action={
                <Button variant="secondary" size="sm" asChild>
                  <Link to="/demandes/nouvelle">
                    <Plus aria-hidden />
                    Créer une demande
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul>
              {pending.slice(0, 6).map((w) => (
                <AttentionRow key={w.id} workflow={w} />
              ))}
            </ul>
          )}
        </Card>

        {/* Activité récente */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Activité récente"
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/audit">
                  Journal
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            }
          />
          {activity.isLoading ? (
            <SkeletonTable rows={5} cols={2} />
          ) : activity.isError ? (
            <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />
          ) : (activity.data?.logs.length ?? 0) === 0 ? (
            <EmptyState
              icon={FileSignature}
              title="Aucune activité"
              description="Les signatures et demandes apparaîtront ici."
            />
          ) : (
            <ul>
              {activity.data?.logs.map((entry, i) => (
                <ActivityRow
                  key={entry.signature_id ?? entry.workflow_id ?? `${entry.timestamp}-${i}`}
                  entry={entry}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Rappel du principe produit */}
      <Card className="mt-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
          <ShieldCheck className="size-5 shrink-0 text-accent" aria-hidden />
          <p className="min-w-0 flex-1 text-base text-slate">
            <span className="font-medium text-ink">Vos documents ne quittent pas ce poste.</span>{' '}
            Seule leur empreinte cryptographique est transmise pour signature.
          </p>
          {stats.data ? (
            <MonoValue
              value={`${stats.data.total_events} événements tracés`}
              copyable={false}
            />
          ) : null}
        </div>
      </Card>
    </>
  );
}
