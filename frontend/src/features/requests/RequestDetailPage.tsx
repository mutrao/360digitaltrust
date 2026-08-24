import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  Check,
  Clock,
  Copy,
  FileText,
  Mail,
  PenLine,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card';
import { Avatar, DetailRow, MonoValue } from '@/components/ui/Data';
import { SignerStatusBadge, WorkflowStatusBadge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { ErrorState, SkeletonText } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { SignStepDialog } from './SignStepDialog';
import {
  nextSigner,
  useCancelWorkflow,
  useCapabilities,
  useWorkflow,
  workflowProgress,
} from '@/hooks/queries';
import { copyToClipboard, formatDateTime, isExpired } from '@/lib/utils';
import { shortHash } from '@/lib/crypto';
import { toToastText } from '@/services/api/errors';
import { useAuth } from '@/services/auth/AuthProvider';
import type { Workflow, WorkflowSigner } from '@/types/api';

const MODE_LABEL: Record<Workflow['mode'], string> = {
  sequential: 'Séquentiel — chacun son tour',
  parallel: 'Parallèle — ordre libre',
  mixed: 'Mixte',
};

/** Empreinte reçue en base64 ; affichée en hexadécimal, plus familier. */
function base64ToHex(b64: string): string {
  try {
    const binary = atob(b64);
    let hex = '';
    for (let i = 0; i < binary.length; i += 1) {
      hex += binary.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
  } catch {
    return b64;
  }
}

/**
 * Chronologie verticale. L'ordre des signataires porte une information réelle
 * en mode séquentiel : le rang détermine qui peut signer.
 */
function Timeline({ workflow }: { workflow: Workflow }): JSX.Element {
  const awaiting = nextSigner(workflow);
  const ordered =
    workflow.mode === 'sequential'
      ? [...workflow.signers].sort((a, b) => a.order - b.order)
      : workflow.signers;

  const isAwaited = (signer: WorkflowSigner): boolean =>
    workflow.status === 'pending' && awaiting?.user_id === signer.user_id;

  return (
    <ol className="relative">
      {/* Départ */}
      <li className="relative flex gap-4 pb-6">
        <span className="absolute left-[11px] top-6 h-full w-px bg-line" aria-hidden />
        <span
          className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
          aria-hidden
        >
          <FileText className="size-3" />
        </span>
        <div className="min-w-0 -mt-0.5">
          <p className="text-base font-medium text-ink">Demande créée</p>
          <p className="mt-0.5 text-sm text-muted">
            {formatDateTime(workflow.created_at)} · par {workflow.created_by}
          </p>
        </div>
      </li>

      {ordered.map((signer, index) => {
        const last = index === ordered.length - 1;
        const signed = signer.status === 'signed';
        const awaited = isAwaited(signer);

        return (
          <li key={signer.user_id} className="relative flex gap-4 pb-6">
            {!last ? (
              <span className="absolute left-[11px] top-6 h-full w-px bg-line" aria-hidden />
            ) : null}
            <span
              className={
                signed
                  ? 'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-success text-white'
                  : awaited
                    ? 'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning ring-2 ring-warning/25'
                    : 'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-ground text-muted'
              }
              aria-hidden
            >
              {signed ? <Check className="size-3" /> : <Clock className="size-3" />}
            </span>

            <div className="min-w-0 -mt-0.5 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Avatar name={signer.name} size="sm" />
                <span className="truncate text-base font-medium text-ink">
                  {signer.name}
                </span>
                <SignerStatusBadge status={signer.status} />
                {!signer.required ? (
                  <span className="text-sm text-muted">(facultatif)</span>
                ) : null}
              </div>

              <p className="mt-1 truncate text-sm text-muted">
                {signer.email}
                {workflow.mode === 'sequential' ? ` · rang ${signer.order}` : ''}
              </p>

              {signed && signer.signed_at ? (
                <p className="mt-1 text-sm text-slate">
                  Signé le {formatDateTime(signer.signed_at)}
                </p>
              ) : awaited ? (
                <p className="mt-1 text-sm font-medium text-warning">
                  En attente de sa signature
                </p>
              ) : null}

              {signer.signature_id ? (
                <div className="mt-1.5">
                  <MonoValue
                    value={signer.signature_id}
                    display={`sig ${signer.signature_id.slice(0, 8)}…`}
                    label="l'identifiant de signature"
                  />
                </div>
              ) : null}
            </div>
          </li>
        );
      })}

      {/* Fin */}
      <li className="relative flex gap-4">
        <span
          className={
            workflow.status === 'completed'
              ? 'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-success text-white'
              : 'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-ground text-muted'
          }
          aria-hidden
        >
          <ShieldCheck className="size-3" />
        </span>
        <div className="min-w-0 -mt-0.5">
          <p
            className={
              workflow.status === 'completed'
                ? 'text-base font-medium text-success'
                : 'text-base text-muted'
            }
          >
            {workflow.status === 'completed' ? 'Demande finalisée' : 'Finalisation'}
          </p>
          {workflow.completed_at ? (
            <p className="mt-0.5 text-sm text-muted">
              {formatDateTime(workflow.completed_at)}
            </p>
          ) : null}
        </div>
      </li>
    </ol>
  );
}

export function RequestDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { principal, can } = useAuth();
  const { data: caps } = useCapabilities();

  const { data: workflow, isLoading, isError, error, refetch } = useWorkflow(id);
  const cancel = useCancelWorkflow();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardBody>
          <SkeletonText lines={8} />
        </CardBody>
      </Card>
    );
  }

  if (isError || !workflow) {
    return <ErrorState error={error} onRetry={() => void refetch()} />;
  }

  const expired = isExpired(workflow.expires_at);
  const progress = workflowProgress(workflow);
  const awaiting = nextSigner(workflow);
  const canSign = workflow.status === 'pending' && !expired && awaiting !== null;
  const canCancel = workflow.status === 'pending' && can('request:cancel');

  const handleCancel = async (): Promise<void> => {
    try {
      await cancel.mutateAsync({
        id: workflow.id,
        by: principal?.username ?? 'admin',
      });
      toast.success('Demande annulée', 'Les signataires ne peuvent plus la signer.');
      setConfirmOpen(false);
    } catch (e) {
      toast.error('Annulation impossible', toToastText(e, 'annulation de demande'));
    }
  };

  const shareLink = `${window.location.origin}/demandes/${workflow.id}`;

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" asChild>
        <Link to="/demandes">
          <ArrowLeft aria-hidden />
          Demandes
        </Link>
      </Button>

      <PageHeader
        title={workflow.title}
        description={`${progress.signed} signature${progress.signed > 1 ? 's' : ''} sur ${progress.required} requise${progress.required > 1 ? 's' : ''}`}
        actions={
          <>
            {canCancel ? (
              <Button variant="ghost" onClick={() => setConfirmOpen(true)}>
                <Ban aria-hidden />
                Annuler
              </Button>
            ) : null}
            {canSign ? (
              <Button variant="primary" onClick={() => setSignOpen(true)}>
                <PenLine aria-hidden />
                Signer
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Parcours de signature" />
          <CardBody>
            <Timeline workflow={workflow} />
          </CardBody>
        </Card>

        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card>
            <CardHeader title="Informations" />
            <CardBody className="py-1">
              <dl>
                <DetailRow label="Statut">
                  <WorkflowStatusBadge status={workflow.status} expired={expired} />
                </DetailRow>
                <DetailRow label="Document">
                  <span className="break-words">{workflow.document_name}</span>
                </DetailRow>
                <DetailRow label="Empreinte">
                  <MonoValue
                    value={base64ToHex(workflow.document_hash_b64)}
                    display={shortHash(base64ToHex(workflow.document_hash_b64), 8)}
                    label="l'empreinte du document"
                  />
                </DetailRow>
                <DetailRow label="Algorithme">
                  <span className="font-mono text-sm">
                    {workflow.hash_algorithm.toUpperCase()}
                  </span>
                </DetailRow>
                <DetailRow label="Mode">{MODE_LABEL[workflow.mode]}</DetailRow>
                <DetailRow label="Créée le">
                  {formatDateTime(workflow.created_at)}
                </DetailRow>
                <DetailRow label="Expire le">
                  {workflow.expires_at ? (
                    <span className={expired ? 'text-danger' : undefined}>
                      {formatDateTime(workflow.expires_at)}
                    </span>
                  ) : (
                    <span className="text-muted">Sans échéance</span>
                  )}
                </DetailRow>
                <DetailRow label="Identifiant">
                  <MonoValue
                    value={workflow.id}
                    display={`${workflow.id.slice(0, 13)}…`}
                    label="l'identifiant de la demande"
                  />
                </DetailRow>
              </dl>
            </CardBody>
          </Card>

          {workflow.message ? (
            <Card>
              <CardHeader title="Message aux signataires" />
              <CardBody>
                <p className="whitespace-pre-wrap text-base text-slate">
                  {workflow.message}
                </p>
              </CardBody>
            </Card>
          ) : null}

          {/*
            Le backend n'envoie pas d'e-mail (voir BACKEND_INTEGRATION.md §3.3).
            Plutôt qu'un bouton « Envoyer » inerte, on donne le lien à transmettre.
          */}
          {workflow.status === 'pending' &&
          caps?.features?.email_notifications === false ? (
            <Card>
              <CardHeader
                title="Inviter les signataires"
                description="L'envoi automatique d'e-mails n'est pas activé sur cette installation."
              />
              <CardBody className="pt-0">
                <div className="rounded border border-line bg-ground p-3">
                  <p className="mb-2 text-sm text-slate">
                    Transmettez ce lien aux signataires par le canal de votre choix.
                    Chacun doit disposer du document d'origine pour signer.
                  </p>
                  <MonoValue value={shareLink} display={shareLink} label="le lien" />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => {
                    void copyToClipboard(shareLink).then((ok) =>
                      ok
                        ? toast.success('Lien copié')
                        : toast.error('Copie impossible', 'Sélectionnez le lien manuellement.'),
                    );
                  }}
                >
                  <Copy aria-hidden />
                  Copier le lien d'invitation
                </Button>
                <p className="mt-2 flex items-start gap-1.5 text-sm text-muted">
                  <Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  L'envoi automatique nécessite une évolution du backend.
                </p>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Annuler cette demande ?"
        description={
          <>
            Les signataires ne pourront plus signer «&nbsp;{workflow.title}&nbsp;».
            Les signatures déjà apposées restent valides et tracées dans le journal
            d'audit. Cette action est irréversible.
          </>
        }
        confirmLabel="Annuler la demande"
        destructive
        loading={cancel.isPending}
        onConfirm={handleCancel}
      />

      {canSign && awaiting ? (
        <SignStepDialog
          open={signOpen}
          onOpenChange={setSignOpen}
          workflow={workflow}
          signer={awaiting}
        />
      ) : null}
    </>
  );
}
