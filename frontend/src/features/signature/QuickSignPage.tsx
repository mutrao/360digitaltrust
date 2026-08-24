/** Signature directe d'un document, sans passer par un workflow. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, PenLine, RotateCcw, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card';
import { DetailRow, MonoValue } from '@/components/ui/Data';
import { InputField, SelectField, TextareaField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { DocumentPicker } from '@/components/common/DocumentPicker';
import { useSignHash, useUsers } from '@/hooks/queries';
import { formatDateTime } from '@/lib/utils';
import type { FileDigest } from '@/lib/crypto';
import { toToastText } from '@/services/api/errors';
import { useAuth } from '@/services/auth/AuthProvider';
import type { HashAlgorithm, SignHashResponse } from '@/types/api';

const ALGORITHMS = [
  { value: 'sha256', label: 'SHA-256 — recommandé' },
  { value: 'sha384', label: 'SHA-384' },
  { value: 'sha512', label: 'SHA-512' },
] as const;

export function QuickSignPage(): JSX.Element {
  const toast = useToast();
  const { principal } = useAuth();
  const signHash = useSignHash();
  const { data: directory } = useUsers();

  const [algorithm, setAlgorithm] = useState<HashAlgorithm>('sha256');
  const [digest, setDigest] = useState<FileDigest | null>(null);
  const [keyId, setKeyId] = useState('');
  const [certificatePem, setCertificatePem] = useState('');
  const [result, setResult] = useState<SignHashResponse | null>(null);

  const identities =
    directory?.users.filter((u) => u.key_id && u.status === 'active') ?? [];

  const ready =
    digest !== null && keyId.trim() !== '' && certificatePem.includes('BEGIN CERTIFICATE');

  const applyIdentity = (userId: string): void => {
    const user = identities.find((u) => u.id === userId);
    if (!user?.key_id) return;
    setKeyId(user.key_id);
    setCertificatePem(user.certificate_pem ?? '');
  };

  const submit = async (): Promise<void> => {
    if (!digest) return;
    try {
      setResult(
        await signHash.mutateAsync({
          key_id: keyId.trim(),
          certificate_pem: certificatePem.trim(),
          document_hash_b64: digest.hashB64,
          hash_algorithm: digest.algorithm,
          document_name: digest.fileName,
          document_mime: digest.mimeType,
          signer_id: principal?.username ?? 'anonymous',
        }),
      );
      toast.success('Document signé', 'La signature est inscrite au journal d’audit.');
    } catch (e) {
      toast.error('Signature impossible', toToastText(e));
    }
  };

  const reset = (): void => {
    setResult(null);
    setDigest(null);
  };

  // ── Résultat ───────────────────────────────────────────────────
  if (result) {
    return (
      <>
        <PageHeader title="Signature rapide" />
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardBody>
              <div className="flex flex-col items-center border-b border-line pb-6 text-center">
                <span
                  className="mb-4 flex size-12 items-center justify-center rounded-full bg-success-soft text-success"
                  aria-hidden
                >
                  <CheckCircle2 className="size-6" />
                </span>
                <p className="text-xl font-semibold text-ink">Document signé</p>
                <p className="mt-1.5 max-w-md text-base text-slate">
                  La signature est horodatée et vérifiable à tout moment depuis son
                  identifiant.
                </p>
              </div>

              <dl className="pt-2">
                <DetailRow label="Identifiant de signature">
                  <MonoValue value={result.signature_id} label="l'identifiant" />
                </DetailRow>
                <DetailRow label="Signé le">{formatDateTime(result.signed_at)}</DetailRow>
                <DetailRow label="Signataire">
                  <span className="break-words font-mono text-sm">
                    {result.certificate_subject}
                  </span>
                </DetailRow>
                <DetailRow label="Algorithme">
                  <span className="font-mono text-sm">
                    {result.hash_algorithm.toUpperCase()}
                  </span>
                </DetailRow>
                <DetailRow label="Signature (Base64)">
                  <MonoValue
                    value={result.signature_b64}
                    display={`${result.signature_b64.slice(0, 32)}…`}
                    label="la signature"
                  />
                </DetailRow>
              </dl>
            </CardBody>
            <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-ground/50 px-5 py-3.5">
              <Button variant="ghost" onClick={reset}>
                <RotateCcw aria-hidden />
                Signer un autre document
              </Button>
              <Button variant="secondary" asChild>
                <Link to={`/verifier?id=${encodeURIComponent(result.signature_id)}`}>
                  <ShieldCheck aria-hidden />
                  Vérifier cette signature
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      </>
    );
  }

  // ── Formulaire ─────────────────────────────────────────────────
  return (
    <>
      <PageHeader
        title="Signature rapide"
        description="Signez un document immédiatement, sans créer de demande multi-signataires."
      />

      <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Document"
            description="L'empreinte est calculée sur votre poste."
          />
          <CardBody className="flex flex-col gap-4">
            <SelectField
              label="Algorithme d'empreinte"
              options={ALGORITHMS}
              value={algorithm}
              onChange={(e) => {
                setAlgorithm(e.target.value as HashAlgorithm);
                setDigest(null);
              }}
            />
            <DocumentPicker digest={digest} onDigest={setDigest} algorithm={algorithm} />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Identité de signature"
            description="Clé et certificat qui vous représentent."
          />
          <CardBody className="flex flex-col gap-4">
            {identities.length > 0 ? (
              <SelectField
                label="Identité enregistrée"
                options={[
                  { value: '', label: 'Saisir manuellement…' },
                  ...identities.map((u) => ({ value: u.id, label: u.name })),
                ]}
                value=""
                onChange={(e) => applyIdentity(e.target.value)}
              />
            ) : null}

            <InputField
              label="Identifiant de clé"
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder="00000000-0000-…"
              autoComplete="off"
              spellCheck={false}
              required
              mono
            />

            <TextareaField
              label="Certificat (PEM)"
              value={certificatePem}
              onChange={(e) => setCertificatePem(e.target.value)}
              placeholder="-----BEGIN CERTIFICATE-----"
              rows={5}
              required
              mono
              error={
                certificatePem !== '' && !certificatePem.includes('BEGIN CERTIFICATE')
                  ? 'Ce texte ne ressemble pas à un certificat PEM.'
                  : undefined
              }
            />

            <p className="text-sm text-muted">
              Pas encore de clé ?{' '}
              <Link
                to="/cles"
                className="font-medium text-accent underline-offset-4 hover:underline"
              >
                Générez-en une
              </Link>
              .
            </p>

            <Button
              variant="primary"
              className="w-full"
              onClick={() => void submit()}
              loading={signHash.isPending}
              disabled={!ready}
            >
              <PenLine aria-hidden />
              Signer le document
            </Button>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
