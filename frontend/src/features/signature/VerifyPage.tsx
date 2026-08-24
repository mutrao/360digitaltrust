/**
 * Vérification d'une signature par son identifiant.
 *
 * Ce que cet écran prouve : la signature a bien été émise par la plateforme,
 * à cette date, sur cette empreinte. Ce qu'il ne prouve pas : que le document
 * dont vous disposez est celui qui a été signé — pour cela, l'utilisateur
 * recalcule l'empreinte de son fichier et la compare ici même.
 */
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, FileSearch, Search, ShieldCheck, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card';
import { DetailRow, MonoValue } from '@/components/ui/Data';
import { EmptyState, ErrorState, SkeletonText } from '@/components/ui/States';
import { DocumentPicker } from '@/components/common/DocumentPicker';
import { useAuditEntry } from '@/hooks/queries';
import { formatDateTime } from '@/lib/utils';
import type { FileDigest } from '@/lib/crypto';
import { ApiError } from '@/services/api/errors';

export function VerifyPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get('id') ?? '');
  const [comparison, setComparison] = useState<FileDigest | null>(null);

  const signatureId = params.get('id') ?? '';
  const { data: entry, isLoading, isError, error, refetch } = useAuditEntry(signatureId);

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const value = input.trim();
    setComparison(null);
    if (value) setParams({ id: value }, { replace: true });
    else setParams({}, { replace: true });
  };

  const notFound = isError && error instanceof ApiError && error.status === 404;

  /** Comparaison stricte : l'empreinte recalculée doit être identique. */
  const match =
    comparison && entry?.document_hash_b64
      ? comparison.hashB64 === entry.document_hash_b64
      : null;

  return (
    <>
      <PageHeader
        title="Vérifier une signature"
        description="Contrôlez l'authenticité d'une signature à partir de son identifiant."
      />

      <div className="mx-auto max-w-2xl">
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1">
                <label
                  htmlFor="verify-id"
                  className="mb-1.5 block text-sm font-medium text-ink"
                >
                  Identifiant de signature
                </label>
                <input
                  id="verify-id"
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-9 w-full rounded border border-line bg-surface px-3 font-mono text-sm text-ink placeholder:text-muted"
                />
              </div>
              <Button type="submit" variant="primary" disabled={input.trim() === ''}>
                <Search aria-hidden />
                Vérifier
              </Button>
            </form>
          </CardBody>
        </Card>

        {!signatureId ? (
          <Card className="mt-5">
            <EmptyState
              icon={FileSearch}
              title="Aucune signature à vérifier"
              description="Saisissez l'identifiant fourni au moment de la signature."
            />
          </Card>
        ) : isLoading ? (
          <Card className="mt-5">
            <CardBody>
              <SkeletonText lines={6} />
            </CardBody>
          </Card>
        ) : notFound ? (
          <Card className="mt-5">
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span
                className="mb-4 flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger"
                aria-hidden
              >
                <XCircle className="size-5" />
              </span>
              <p className="text-base font-medium text-ink">Signature introuvable</p>
              <p className="mt-1.5 max-w-md text-sm text-slate">
                Aucune signature ne correspond à cet identifiant. Vérifiez sa saisie —
                le journal d'audit conserve les signatures pendant 90 jours.
              </p>
            </div>
          </Card>
        ) : isError ? (
          <Card className="mt-5">
            <ErrorState error={error} onRetry={() => void refetch()} />
          </Card>
        ) : entry ? (
          <>
            {/* Verdict */}
            <Card className="mt-5 border-success/30">
              <div className="flex items-start gap-4 border-b border-line p-5">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"
                  aria-hidden
                >
                  <ShieldCheck className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-success">Signature authentique</p>
                  <p className="mt-1 text-base text-slate">
                    Cette signature a été émise par la plateforme le{' '}
                    {formatDateTime(entry.signed_at ?? entry.timestamp)}.
                  </p>
                </div>
              </div>

              <CardBody className="py-1">
                <dl>
                  <DetailRow label="Identifiant">
                    <MonoValue value={signatureId} label="l'identifiant" />
                  </DetailRow>
                  <DetailRow label="Document">
                    {entry.document_name ?? <span className="text-muted">—</span>}
                  </DetailRow>
                  <DetailRow label="Signataire">
                    {entry.signer_id === 'anonymous' ? (
                      <span className="text-muted">Non identifié</span>
                    ) : (
                      entry.signer_id
                    )}
                  </DetailRow>
                  {entry.certificate_subject ? (
                    <DetailRow label="Certificat">
                      <span className="break-words font-mono text-sm">
                        {entry.certificate_subject}
                      </span>
                    </DetailRow>
                  ) : null}
                  <DetailRow label="Algorithme">
                    <span className="font-mono text-sm">
                      {(entry.hash_algorithm ?? 'sha256').toUpperCase()}
                    </span>
                  </DetailRow>
                  {entry.document_hash_b64 ? (
                    <DetailRow label="Empreinte signée">
                      <MonoValue
                        value={entry.document_hash_b64}
                        display={`${entry.document_hash_b64.slice(0, 28)}…`}
                        label="l'empreinte"
                      />
                    </DetailRow>
                  ) : null}
                </dl>
              </CardBody>
            </Card>

            {/* Comparaison avec un fichier local */}
            {entry.document_hash_b64 ? (
              <Card className="mt-5">
                <CardHeader
                  title="Comparer avec votre fichier"
                  description="Confirmez que le document en votre possession est bien celui qui a été signé."
                />
                <CardBody className="flex flex-col gap-4">
                  <DocumentPicker
                    digest={comparison}
                    onDigest={setComparison}
                    algorithm={entry.hash_algorithm ?? 'sha256'}
                  />

                  {match === true ? (
                    <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success-soft/50 p-4">
                      <CheckCircle2
                        className="mt-0.5 size-5 shrink-0 text-success"
                        aria-hidden
                      />
                      <div>
                        <p className="text-base font-medium text-success">
                          Le document correspond
                        </p>
                        <p className="mt-1 text-sm text-slate">
                          Son empreinte est identique à celle qui a été signée : le
                          fichier n'a pas été modifié depuis la signature.
                        </p>
                      </div>
                    </div>
                  ) : match === false ? (
                    <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft/50 p-4">
                      <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-base font-medium text-danger">
                          Le document ne correspond pas
                        </p>
                        <p className="mt-1 text-sm text-slate">
                          Son empreinte diffère de celle qui a été signée. Ce fichier
                          n'est pas celui qui a été signé, ou il a été modifié depuis.
                        </p>
                        <div className="mt-2 flex flex-col gap-1 text-sm">
                          <span className="text-muted">
                            Attendu&nbsp;:{' '}
                            <code className="font-mono">
                              {entry.document_hash_b64.slice(0, 24)}…
                            </code>
                          </span>
                          <span className="text-muted">
                            Obtenu&nbsp;:{' '}
                            <code className="font-mono">
                              {comparison
                                ? `${comparison.hashB64.slice(0, 24)}…`
                                : '—'}
                            </code>
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}
