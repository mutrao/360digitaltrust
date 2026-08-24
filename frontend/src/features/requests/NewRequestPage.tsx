/**
 * Assistant de création d'une demande de signature.
 *
 * Trois étapes seulement : document, signataires, vérification.
 * L'étape « placement des champs » d'un DocuSign n'existe pas ici — le backend
 * ne reçoit jamais le document, il ne peut donc rien y placer
 * (voir BACKEND_INTEGRATION.md §3.5). Une étape factice serait pire qu'absente.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Send,
  Trash2,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card';
import { Avatar, DetailRow, MonoValue } from '@/components/ui/Data';
import { InputField, SelectField, TextareaField } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { DocumentPicker } from '@/components/common/DocumentPicker';
import { useCreateWorkflow, useUsers } from '@/hooks/queries';
import { cn, formatBytes } from '@/lib/utils';
import { shortHash, type FileDigest } from '@/lib/crypto';
import { toToastText } from '@/services/api/errors';
import { useAuth } from '@/services/auth/AuthProvider';
import type { WorkflowMode, WorkflowSignerInput } from '@/types/api';

const STEPS = ['Document', 'Signataires', 'Vérification'] as const;
type StepIndex = 0 | 1 | 2;

const MODE_OPTIONS = [
  { value: 'sequential', label: 'Séquentiel — chacun signe à son tour' },
  { value: 'parallel', label: 'Parallèle — ordre libre' },
  { value: 'mixed', label: 'Mixte' },
] as const;

const EXPIRY_OPTIONS = [
  { value: '', label: 'Sans échéance' },
  { value: '7', label: '7 jours' },
  { value: '14', label: '14 jours' },
  { value: '30', label: '30 jours' },
  { value: '90', label: '90 jours' },
] as const;

interface DraftSigner extends WorkflowSignerInput {
  /** Clé locale stable : `user_id` peut changer pendant la saisie. */
  key: string;
}

function newSigner(order: number): DraftSigner {
  const key = crypto.randomUUID();
  return { key, user_id: key, name: '', email: '', order, required: true };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function expiryToIso(days: string): string | null {
  if (days === '') return null;
  const date = new Date();
  date.setDate(date.getDate() + Number(days));
  return date.toISOString();
}

// ── Indicateur d'étapes ──────────────────────────────────────────

function Stepper({ current }: { current: StepIndex }): JSX.Element {
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Progression">
      {STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                done && 'bg-success text-white',
                active && 'bg-accent text-accent-ink',
                !done && !active && 'bg-ground text-muted',
              )}
              aria-hidden
            >
              {done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                'hidden text-sm sm:inline',
                active ? 'font-medium text-ink' : 'text-muted',
              )}
              aria-current={active ? 'step' : undefined}
            >
              {label}
            </span>
            {index < STEPS.length - 1 ? (
              <span
                className={cn('h-px flex-1', done ? 'bg-success' : 'bg-line')}
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export function NewRequestPage(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const { principal } = useAuth();
  const createWorkflow = useCreateWorkflow();
  const { data: directory } = useUsers();

  const [step, setStep] = useState<StepIndex>(0);
  const [digest, setDigest] = useState<FileDigest | null>(null);
  const [title, setTitle] = useState('');
  const [signers, setSigners] = useState<DraftSigner[]>([newSigner(1)]);
  const [mode, setMode] = useState<WorkflowMode>('sequential');
  const [expiryDays, setExpiryDays] = useState('30');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const updateSigner = (key: string, patch: Partial<DraftSigner>): void => {
    setSigners((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  };

  const addSigner = (): void => {
    setSigners((list) => [...list, newSigner(list.length + 1)]);
  };

  const removeSigner = (key: string): void => {
    setSigners((list) =>
      list.filter((s) => s.key !== key).map((s, i) => ({ ...s, order: i + 1 })),
    );
  };

  /** Reprend un signataire de l'annuaire pour éviter la ressaisie. */
  const pickFromDirectory = (key: string, userId: string): void => {
    const found = directory?.users.find((u) => u.id === userId);
    if (!found) return;
    updateSigner(key, { user_id: found.id, name: found.name, email: found.email });
  };

  const validSigners = signers.filter(
    (s) => s.name.trim() !== '' && isValidEmail(s.email),
  );

  const canLeaveStep0 = digest !== null && title.trim() !== '';
  const canLeaveStep1 = validSigners.length > 0 && validSigners.length === signers.length;

  const directoryOptions = [
    { value: '', label: "Saisir manuellement…" },
    ...(directory?.users
      .filter((u) => u.status === 'active')
      .map((u) => ({ value: u.id, label: `${u.name} — ${u.email}` })) ?? []),
  ];

  const submit = async (): Promise<void> => {
    if (!digest) return;
    setSubmitted(true);
    try {
      const result = await createWorkflow.mutateAsync({
        title: title.trim(),
        document_name: digest.fileName,
        document_hash_b64: digest.hashB64,
        hash_algorithm: digest.algorithm,
        mode,
        expires_at: expiryToIso(expiryDays),
        message: message.trim(),
        created_by: principal?.username ?? 'admin',
        signers: signers.map(({ key: _key, ...rest }) => ({
          ...rest,
          name: rest.name.trim(),
          email: rest.email.trim(),
        })),
      });
      toast.success(
        'Demande créée',
        'Transmettez le lien aux signataires depuis la page de la demande.',
      );
      navigate(`/demandes/${result.workflow_id}`);
    } catch (e) {
      setSubmitted(false);
      toast.error('Création impossible', toToastText(e));
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft aria-hidden />
        Retour
      </Button>

      <PageHeader
        title="Nouvelle demande de signature"
        description="Préparez un document et désignez ses signataires."
      />

      <div className="mx-auto max-w-3xl">
        <Stepper current={step} />

        {/* ── Étape 1 : document ── */}
        {step === 0 ? (
          <Card>
            <CardHeader
              title="Document à faire signer"
              description="Son empreinte est calculée sur votre poste ; le fichier n'est pas transmis."
            />
            <CardBody className="flex flex-col gap-5">
              <DocumentPicker digest={digest} onDigest={setDigest} />

              <InputField
                label="Intitulé de la demande"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contrat de prestation — Meridian"
                hint="Ce libellé identifie la demande pour vous et vos signataires."
                required
              />
            </CardBody>
          </Card>
        ) : null}

        {/* ── Étape 2 : signataires ── */}
        {step === 1 ? (
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader
                title="Signataires"
                description={
                  mode === 'sequential'
                    ? "L'ordre d'affichage détermine l'ordre de signature."
                    : 'Chaque signataire peut signer indépendamment des autres.'
                }
                action={
                  <Button variant="secondary" size="sm" onClick={addSigner}>
                    <Plus aria-hidden />
                    Ajouter
                  </Button>
                }
              />
              <CardBody className="flex flex-col gap-4">
                {signers.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="Aucun signataire"
                    description="Ajoutez au moins une personne pour poursuivre."
                    action={
                      <Button variant="primary" size="sm" onClick={addSigner}>
                        <Plus aria-hidden />
                        Ajouter un signataire
                      </Button>
                    }
                  />
                ) : (
                  signers.map((signer, index) => (
                    <div
                      key={signer.key}
                      className="rounded-lg border border-line bg-ground/40 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-sm font-medium text-ink">
                          <span
                            className="flex size-5 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent"
                            aria-hidden
                          >
                            {index + 1}
                          </span>
                          {mode === 'sequential'
                            ? `Signataire ${index + 1}`
                            : 'Signataire'}
                        </span>
                        {signers.length > 1 ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeSigner(signer.key)}
                            aria-label={`Retirer le signataire ${index + 1}`}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-3">
                        {directoryOptions.length > 1 ? (
                          <SelectField
                            label="Depuis l'annuaire"
                            options={directoryOptions}
                            value=""
                            onChange={(e) =>
                              pickFromDirectory(signer.key, e.target.value)
                            }
                          />
                        ) : null}

                        <div className="grid gap-3 sm:grid-cols-2">
                          <InputField
                            label="Nom complet"
                            value={signer.name}
                            onChange={(e) =>
                              updateSigner(signer.key, { name: e.target.value })
                            }
                            placeholder="Alice Martin"
                            autoComplete="name"
                            required
                          />
                          <InputField
                            label="Adresse e-mail"
                            type="email"
                            value={signer.email}
                            onChange={(e) =>
                              updateSigner(signer.key, { email: e.target.value })
                            }
                            placeholder="alice.martin@exemple.fr"
                            autoComplete="email"
                            required
                            error={
                              signer.email !== '' && !isValidEmail(signer.email)
                                ? 'Adresse e-mail invalide.'
                                : undefined
                            }
                          />
                        </div>

                        <label className="flex items-center gap-2 text-sm text-slate">
                          <input
                            type="checkbox"
                            checked={!signer.required}
                            onChange={(e) =>
                              updateSigner(signer.key, { required: !e.target.checked })
                            }
                            className="size-3.5 rounded border-line"
                          />
                          Signature facultative — la demande peut se finaliser sans elle
                        </label>
                      </div>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Paramètres" />
              <CardBody className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Ordre de signature"
                    options={MODE_OPTIONS}
                    value={mode}
                    onChange={(e) => setMode(e.target.value as WorkflowMode)}
                  />
                  <SelectField
                    label="Échéance"
                    options={EXPIRY_OPTIONS}
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value)}
                    hint="Au-delà, la demande est signalée comme expirée."
                  />
                </div>
                <TextareaField
                  label="Message aux signataires"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Merci de signer ce contrat avant la fin du mois."
                  hint="Facultatif. Visible sur la page de la demande."
                  rows={3}
                />
              </CardBody>
            </Card>
          </div>
        ) : null}

        {/* ── Étape 3 : vérification ── */}
        {step === 2 && digest ? (
          <Card>
            <CardHeader
              title="Vérifiez avant d'envoyer"
              description="Une demande créée ne peut plus être modifiée."
            />
            <CardBody className="py-1">
              <dl>
                <DetailRow label="Intitulé">{title}</DetailRow>
                <DetailRow label="Document">
                  <span className="break-words">{digest.fileName}</span>
                  <span className="ml-2 text-sm text-muted">
                    {formatBytes(digest.fileSize)}
                  </span>
                </DetailRow>
                <DetailRow label="Empreinte">
                  <MonoValue
                    value={digest.hashHex}
                    display={shortHash(digest.hashHex, 10)}
                    label="l'empreinte"
                  />
                </DetailRow>
                <DetailRow label="Ordre">
                  {MODE_OPTIONS.find((o) => o.value === mode)?.label}
                </DetailRow>
                <DetailRow label="Échéance">
                  {EXPIRY_OPTIONS.find((o) => o.value === expiryDays)?.label}
                </DetailRow>
                <DetailRow label="Signataires">
                  <ul className="flex flex-col gap-2">
                    {signers.map((s, i) => (
                      <li key={s.key} className="flex items-center gap-2">
                        <Avatar name={s.name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-base text-ink">
                            {s.name}
                            {!s.required ? (
                              <span className="ml-1.5 text-sm text-muted">
                                (facultatif)
                              </span>
                            ) : null}
                          </span>
                          <span className="block truncate text-sm text-muted">
                            {s.email}
                            {mode === 'sequential' ? ` · rang ${i + 1}` : ''}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </DetailRow>
                {message ? (
                  <DetailRow label="Message">
                    <span className="whitespace-pre-wrap">{message}</span>
                  </DetailRow>
                ) : null}
              </dl>
            </CardBody>
          </Card>
        ) : null}

        {/* Navigation */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1) as StepIndex)}
            disabled={step === 0}
          >
            <ArrowLeft aria-hidden />
            Précédent
          </Button>

          {step < 2 ? (
            <Button
              variant="primary"
              onClick={() => setStep((s) => (s + 1) as StepIndex)}
              disabled={step === 0 ? !canLeaveStep0 : !canLeaveStep1}
            >
              Continuer
              <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => void submit()}
              loading={createWorkflow.isPending || submitted}
            >
              <Send aria-hidden />
              Créer la demande
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
