/**
 * Apposition d'une signature sur une étape de workflow.
 *
 * Le signataire doit fournir la clé et le certificat qui le représentent :
 * le backend ne connaît aucune identité (voir BACKEND_INTEGRATION.md §3.1),
 * il ne peut donc pas les retrouver seul.
 */
import { useMemo, useState } from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { InputField, TextareaField } from '@/components/ui/Field';
import { MonoValue } from '@/components/ui/Data';
import { useToast } from '@/components/ui/Toast';
import { useSignWorkflowStep, useUsers } from '@/hooks/queries';
import { toToastText } from '@/services/api/errors';
import { formatDateTime } from '@/lib/utils';
import type { Workflow, WorkflowSigner } from '@/types/api';

interface SignStepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: Workflow;
  signer: WorkflowSigner;
}

export function SignStepDialog({
  open,
  onOpenChange,
  workflow,
  signer,
}: SignStepDialogProps): JSX.Element {
  const toast = useToast();
  const sign = useSignWorkflowStep();
  const { data: users } = useUsers();

  const [keyId, setKeyId] = useState('');
  const [certificatePem, setCertificatePem] = useState('');
  const [signedAt, setSignedAt] = useState<string | null>(null);

  /**
   * Si le signataire existe dans l'annuaire avec un certificat associé,
   * on lui évite de le ressaisir.
   */
  const known = useMemo(
    () => users?.users.find((u) => u.id === signer.user_id && u.key_id),
    [users, signer.user_id],
  );

  const useStoredIdentity = (): void => {
    if (!known?.key_id) return;
    setKeyId(known.key_id);
    setCertificatePem(known.certificate_pem ?? '');
  };

  const ready = keyId.trim() !== '' && certificatePem.includes('BEGIN CERTIFICATE');

  const handleSign = async (): Promise<void> => {
    try {
      const result = await sign.mutateAsync({
        workflow_id: workflow.id,
        signer_id: signer.user_id,
        key_id: keyId.trim(),
        certificate_pem: certificatePem.trim(),
      });
      setSignedAt(result.signed_at);
      toast.success(
        'Signature apposée',
        result.workflow_status === 'completed'
          ? 'Toutes les signatures requises ont été recueillies.'
          : 'La demande passe au signataire suivant.',
      );
    } catch (e) {
      toast.error('Signature impossible', toToastText(e));
    }
  };

  const close = (): void => {
    setSignedAt(null);
    setKeyId('');
    setCertificatePem('');
    onOpenChange(false);
  };

  // ── Confirmation ───────────────────────────────────────────────
  if (signedAt) {
    return (
      <Dialog
        open={open}
        onOpenChange={close}
        title="Document signé"
        footer={
          <Button variant="primary" onClick={close}>
            Terminer
          </Button>
        }
      >
        <div className="flex flex-col items-center py-4 text-center">
          <span
            className="mb-4 flex size-12 items-center justify-center rounded-full bg-success-soft text-success"
            aria-hidden
          >
            <CheckCircle2 className="size-6" />
          </span>
          <p className="text-lg font-medium text-ink">Votre signature a été enregistrée</p>
          <p className="mt-1.5 max-w-sm text-base text-slate">
            Elle est horodatée et inscrite au journal d'audit. Vous pouvez la vérifier
            à tout moment depuis son identifiant.
          </p>
          <p className="mt-4 text-sm text-muted">{formatDateTime(signedAt)}</p>
        </div>
      </Dialog>
    );
  }

  // ── Formulaire ─────────────────────────────────────────────────
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Signer la demande"
      description={`Vous signez en tant que ${signer.name}.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSign()}
            loading={sign.isPending}
            disabled={!ready}
          >
            <ShieldCheck aria-hidden />
            Signer le document
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Ce sur quoi porte l'engagement */}
        <div className="rounded border border-line bg-ground p-3">
          <p className="text-sm font-medium text-ink">{workflow.document_name}</p>
          <p className="mt-1 text-sm text-slate">
            En signant, vous attestez de votre accord sur ce document.
            Votre signature porte sur son empreinte {workflow.hash_algorithm.toUpperCase()}.
          </p>
          <div className="mt-2">
            <MonoValue
              value={workflow.document_hash_b64}
              display={`${workflow.document_hash_b64.slice(0, 24)}…`}
              label="l'empreinte signée"
            />
          </div>
        </div>

        {known?.key_id ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-accent/25 bg-accent-soft p-3">
            <p className="text-sm text-accent">
              Une identité de signature est enregistrée pour {known.name}.
            </p>
            <Button variant="secondary" size="sm" onClick={useStoredIdentity}>
              Utiliser
            </Button>
          </div>
        ) : null}

        <InputField
          label="Identifiant de clé"
          value={keyId}
          onChange={(e) => setKeyId(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          hint="Généré dans Clés & certificats. La clé privée reste sur le serveur."
          autoComplete="off"
          spellCheck={false}
          required
          mono
        />

        <TextareaField
          label="Certificat du signataire (PEM)"
          value={certificatePem}
          onChange={(e) => setCertificatePem(e.target.value)}
          placeholder="-----BEGIN CERTIFICATE-----"
          hint="Certificat X.509 émis pour cette clé."
          rows={5}
          required
          mono
          error={
            certificatePem !== '' && !certificatePem.includes('BEGIN CERTIFICATE')
              ? 'Ce texte ne ressemble pas à un certificat PEM.'
              : undefined
          }
        />
      </div>
    </Dialog>
  );
}
