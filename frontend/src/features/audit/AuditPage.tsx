import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Ban, Download, FilePlus2, PenLine, Search } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Card';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Avatar, Table, Td, Th, Tr } from '@/components/ui/Data';
import { SelectField } from '@/components/ui/Field';
import {
  EmptyState,
  ErrorState,
  SkeletonTable,
  TruncationNotice,
} from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useAuditLogs, useAuditStats } from '@/hooks/queries';
import { formatDateTime, formatRelative } from '@/lib/utils';
import type { AuditEntry } from '@/types/api';

const LIMIT = 200;

const EVENT_META: Record<
  string,
  { label: string; tone: Tone; icon: typeof PenLine }
> = {
  sign_hash: { label: 'Signature apposée', tone: 'success', icon: PenLine },
  workflow_created: { label: 'Demande créée', tone: 'accent', icon: FilePlus2 },
  workflow_cancelled: { label: 'Demande annulée', tone: 'neutral', icon: Ban },
};

const EVENT_OPTIONS = [
  { value: '', label: 'Tous les événements' },
  { value: 'sign_hash', label: 'Signatures apposées' },
  { value: 'workflow_created', label: 'Demandes créées' },
  { value: 'workflow_cancelled', label: 'Demandes annulées' },
] as const;

const PERIOD_OPTIONS = [
  { value: 'all', label: 'Toute la période' },
  { value: '1', label: 'Dernières 24 heures' },
  { value: '7', label: '7 derniers jours' },
  { value: '30', label: '30 derniers jours' },
] as const;

function withinPeriod(entry: AuditEntry, days: string): boolean {
  if (days === 'all') return true;
  const time = new Date(entry.timestamp).getTime();
  if (Number.isNaN(time)) return false;
  return time >= Date.now() - Number(days) * 86_400_000;
}

/** Export CSV local — le backend n'expose pas d'export dédié. */
function toCsv(entries: readonly AuditEntry[]): string {
  const header = [
    'horodatage',
    'evenement',
    'acteur',
    'document',
    'identifiant_signature',
    'identifiant_demande',
    'algorithme',
    'sujet_certificat',
  ];

  const escape = (value: unknown): string => {
    const text = value === undefined || value === null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const rows = entries.map((e) =>
    [
      e.timestamp,
      e.event,
      e.signer_id ?? e.created_by ?? e.cancelled_by ?? '',
      e.document_name ?? e.title ?? '',
      e.signature_id ?? '',
      e.workflow_id ?? '',
      e.hash_algorithm ?? '',
      e.certificate_subject ?? '',
    ]
      .map(escape)
      .join(','),
  );

  return [header.join(','), ...rows].join('\n');
}

export function AuditPage(): JSX.Element {
  const toast = useToast();
  const [eventType, setEventType] = useState('');
  const [period, setPeriod] = useState('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error, refetch } = useAuditLogs({
    limit: LIMIT,
    event_type: eventType || undefined,
  });
  const stats = useAuditStats();

  const rows = useMemo(() => {
    const logs = data?.logs ?? [];
    const term = search.trim().toLowerCase();
    return logs
      .filter((e) => withinPeriod(e, period))
      .filter(
        (e) =>
          term === '' ||
          (e.document_name ?? '').toLowerCase().includes(term) ||
          (e.title ?? '').toLowerCase().includes(term) ||
          (e.signer_id ?? '').toLowerCase().includes(term) ||
          (e.signature_id ?? '').toLowerCase().includes(term),
      );
  }, [data, period, search]);

  const exportCsv = (): void => {
    if (rows.length === 0) return;
    // Le BOM UTF-8 permet à Excel d'ouvrir le fichier avec le bon encodage.
    const blob = new Blob([`\uFEFF${toCsv(rows)}`], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-360dt-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Export généré', `${rows.length} événements exportés.`);
  };

  return (
    <>
      <PageHeader
        title="Journal d'audit"
        description="Traçabilité complète des opérations de signature. Conservation : 90 jours."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download aria-hidden />
            Exporter en CSV
          </Button>
        }
      />

      {stats.data ? (
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          {(
            [
              ['Signatures apposées', stats.data.total_signatures],
              ['Demandes créées', stats.data.total_workflows],
              ['Événements tracés', stats.data.total_events],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-line bg-surface p-4">
              <p className="text-sm text-slate">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-3.5">
          <SelectField
            label="Type d'événement"
            options={EVENT_OPTIONS}
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            wrapperClassName="min-w-[180px]"
            className="h-8 text-sm"
          />
          <SelectField
            label="Période"
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
            <label htmlFor="audit-search" className="mb-1.5 block text-sm font-medium text-ink">
              Rechercher
            </label>
            <Search
              className="pointer-events-none absolute left-2.5 top-[34px] size-3.5 text-muted"
              aria-hidden
            />
            <input
              id="audit-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Document, signataire, identifiant…"
              className="h-8 w-full rounded border border-line bg-surface pl-8 pr-3 text-sm text-ink placeholder:text-muted"
            />
          </div>
        </div>

        {isLoading ? (
          <SkeletonTable rows={8} cols={5} />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Activity}
            title={
              search || eventType || period !== 'all'
                ? 'Aucun événement'
                : "Journal d'audit vide"
            }
            description={
              search || eventType || period !== 'all'
                ? 'Aucun événement ne correspond à ces critères.'
                : "Les signatures et les demandes apparaîtront ici dès qu'elles seront effectuées."
            }
            action={
              search || eventType || period !== 'all' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setEventType('');
                    setPeriod('all');
                  }}
                >
                  Réinitialiser les filtres
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Événement</Th>
                  <Th>Acteur</Th>
                  <Th>Objet</Th>
                  <Th>Référence</Th>
                  <Th className="text-right">Horodatage</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry, index) => {
                  const meta = EVENT_META[entry.event] ?? {
                    label: entry.event,
                    tone: 'neutral' as Tone,
                    icon: Activity,
                  };
                  const Icon = meta.icon;
                  const actor =
                    entry.signer_id ?? entry.created_by ?? entry.cancelled_by ?? 'système';

                  return (
                    <Tr
                      key={entry.signature_id ?? entry.workflow_id ?? `${entry.timestamp}-${index}`}
                    >
                      <Td>
                        <span className="flex items-center gap-2">
                          <Icon className="size-3.5 shrink-0 text-muted" aria-hidden />
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </span>
                      </Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          <Avatar name={actor} size="sm" />
                          <span className="truncate text-base text-ink">
                            {actor === 'anonymous' ? (
                              <span className="text-muted">Non identifié</span>
                            ) : (
                              actor
                            )}
                          </span>
                        </span>
                      </Td>
                      <Td>
                        <span className="block max-w-[220px] truncate text-base text-slate">
                          {entry.document_name ?? entry.title ?? '—'}
                        </span>
                        {entry.hash_algorithm ? (
                          <span className="text-sm text-muted">
                            {entry.hash_algorithm.toUpperCase()}
                          </span>
                        ) : null}
                      </Td>
                      <Td>
                        {entry.signature_id ? (
                          <Link
                            to={`/verifier?id=${encodeURIComponent(entry.signature_id)}`}
                            className="rounded font-mono text-sm text-accent underline-offset-4 hover:underline"
                          >
                            {entry.signature_id.slice(0, 8)}…
                          </Link>
                        ) : entry.workflow_id ? (
                          <Link
                            to={`/demandes/${entry.workflow_id}`}
                            className="rounded font-mono text-sm text-accent underline-offset-4 hover:underline"
                          >
                            {entry.workflow_id.slice(0, 8)}…
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Td>
                      <Td className="text-right">
                        <span
                          className="whitespace-nowrap text-sm text-slate"
                          title={formatDateTime(entry.timestamp)}
                        >
                          {formatRelative(entry.timestamp)}
                        </span>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            <TruncationNotice shown={data?.logs?.length ?? 0} limit={LIMIT} />
          </>
        )}
      </Card>
    </>
  );
}
