import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileSignature, Plus, Search } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Card';
import { Avatar, Table, Td, Th, Tr } from '@/components/ui/Data';
import { WorkflowStatusBadge } from '@/components/ui/Badge';
import {
  EmptyState,
  ErrorState,
  SkeletonTable,
  TruncationNotice,
} from '@/components/ui/States';
import { useWorkflows, workflowProgress } from '@/hooks/queries';
import { formatDateTime, formatRelative, isExpired } from '@/lib/utils';
import type { Workflow, WorkflowStatus } from '@/types/api';

const LIMIT = 100;

type Filter = 'all' | WorkflowStatus | 'expired';

const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Toutes' },
  { value: 'pending', label: 'En attente' },
  { value: 'completed', label: 'Signées' },
  { value: 'expired', label: 'Expirées' },
  { value: 'cancelled', label: 'Annulées' },
];

const MODE_LABEL: Record<Workflow['mode'], string> = {
  sequential: 'Séquentiel',
  parallel: 'Parallèle',
  mixed: 'Mixte',
};

function matches(workflow: Workflow, filter: Filter): boolean {
  const expired = isExpired(workflow.expires_at) && workflow.status === 'pending';
  if (filter === 'all') return true;
  if (filter === 'expired') return expired;
  if (filter === 'pending') return workflow.status === 'pending' && !expired;
  return workflow.status === filter;
}

/** Barre de progression compacte : la proportion se lit sans lire les chiffres. */
function Progress({ workflow }: { workflow: Workflow }): JSX.Element {
  const { signed, required, percent } = workflowProgress(workflow);
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={signed}
        aria-valuemin={0}
        aria-valuemax={required}
        aria-label="Progression des signatures"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-sm tabular-nums text-slate">
        {signed}/{required}
      </span>
    </div>
  );
}

export function RequestsPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');

  const filter = (params.get('statut') as Filter | null) ?? 'all';
  const { data, isLoading, isError, error, refetch } = useWorkflows();

  const rows = useMemo(() => {
    const all = data?.workflows ?? [];
    const term = search.trim().toLowerCase();
    return all
      .filter((w) => matches(w, filter))
      .filter(
        (w) =>
          term === '' ||
          w.title.toLowerCase().includes(term) ||
          w.document_name.toLowerCase().includes(term) ||
          w.signers.some((s) => s.name.toLowerCase().includes(term)),
      );
  }, [data, filter, search]);

  const setFilter = (next: Filter): void => {
    if (next === 'all') params.delete('statut');
    else params.set('statut', next);
    setParams(params, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Demandes de signature"
        description="Suivez l'avancement de chaque demande et de ses signataires."
        actions={
          <Button variant="primary" asChild>
            <Link to="/demandes/nouvelle">
              <Plus aria-hidden />
              Nouvelle demande
            </Link>
          </Button>
        }
      />

      <Card>
        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label="Filtrer par statut"
          >
            {FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={
                  filter === value
                    ? 'rounded bg-accent-soft px-2.5 py-1 text-sm font-medium text-accent'
                    : 'rounded px-2.5 py-1 text-sm text-slate transition-colors hover:bg-ground hover:text-ink'
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un titre, un document, un signataire…"
              aria-label="Rechercher une demande"
              className="h-8 w-full rounded border border-line bg-surface pl-8 pr-3 text-sm text-ink placeholder:text-muted"
            />
          </div>
        </div>

        {isLoading ? (
          <SkeletonTable rows={6} cols={5} />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title={
              search || filter !== 'all'
                ? 'Aucun résultat'
                : 'Aucune demande de signature'
            }
            description={
              search || filter !== 'all'
                ? 'Aucune demande ne correspond à votre recherche.'
                : 'Créez une demande pour faire signer un document par un ou plusieurs signataires.'
            }
            action={
              search || filter !== 'all' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setFilter('all');
                  }}
                >
                  Réinitialiser les filtres
                </Button>
              ) : (
                <Button variant="primary" size="sm" asChild>
                  <Link to="/demandes/nouvelle">
                    <Plus aria-hidden />
                    Créer une demande
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Demande</Th>
                  <Th>Statut</Th>
                  <Th>Signataires</Th>
                  <Th>Progression</Th>
                  <Th className="text-right">Créée</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <Tr key={w.id}>
                    <Td>
                      <Link
                        to={`/demandes/${w.id}`}
                        className="block min-w-0 rounded focus-visible:ring-2"
                      >
                        <span className="block truncate font-medium text-ink hover:text-accent">
                          {w.title}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-muted">
                          {w.document_name} · {MODE_LABEL[w.mode]}
                        </span>
                      </Link>
                    </Td>
                    <Td>
                      <WorkflowStatusBadge
                        status={w.status}
                        expired={isExpired(w.expires_at)}
                      />
                    </Td>
                    <Td>
                      <div className="flex -space-x-1.5">
                        {w.signers.slice(0, 4).map((s) => (
                          <span
                            key={s.user_id}
                            title={`${s.name} — ${s.status === 'signed' ? 'signé' : 'en attente'}`}
                            className="ring-2 ring-surface"
                          >
                            <Avatar name={s.name} size="sm" />
                          </span>
                        ))}
                        {w.signers.length > 4 ? (
                          <span className="flex size-6 items-center justify-center rounded-full bg-ground text-2xs text-slate ring-2 ring-surface">
                            +{w.signers.length - 4}
                          </span>
                        ) : null}
                      </div>
                    </Td>
                    <Td>
                      <Progress workflow={w} />
                    </Td>
                    <Td className="text-right">
                      <span
                        className="whitespace-nowrap text-sm text-slate"
                        title={formatDateTime(w.created_at)}
                      >
                        {formatRelative(w.created_at)}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <TruncationNotice shown={data?.workflows?.length ?? 0} limit={LIMIT} />
          </>
        )}
      </Card>
    </>
  );
}
