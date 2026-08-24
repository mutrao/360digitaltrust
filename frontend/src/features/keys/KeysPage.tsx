/**
 * Génération de clés et de CSR.
 *
 * Les clés générées ne sont pas listables : le backend n'expose aucune route
 * d'inventaire (voir BACKEND_INTEGRATION.md §2.2). On conserve donc les clés
 * de la session en mémoire, et on le dit clairement plutôt que de laisser
 * croire à un coffre consultable.
 */
import { useState } from 'react';
import { AlertTriangle, KeyRound, Plus, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DetailRow, MonoValue } from '@/components/ui/Data';
import { InputField, SelectField } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useGenerateKey, useStorageBackends } from '@/hooks/queries';
import { formatDateTime } from '@/lib/utils';
import { toToastText } from '@/services/api/errors';
import type {
  EcCurve,
  GenerateKeyResponse,
  KeyAlgorithm,
  RsaKeySize,
} from '@/types/api';

const ALGORITHMS = [
  { value: 'RSA', label: 'RSA — compatibilité maximale' },
  { value: 'EC', label: 'ECDSA — clés plus courtes, plus rapides' },
] as const;

const RSA_SIZES = [
  { value: '2048', label: '2048 bits — usage courant' },
  { value: '3072', label: '3072 bits' },
  { value: '4096', label: '4096 bits — conservation longue' },
] as const;

const EC_CURVES = [
  { value: 'P-256', label: 'P-256 (secp256r1)' },
  { value: 'P-384', label: 'P-384 (secp384r1)' },
  { value: 'P-521', label: 'P-521 (secp521r1)' },
] as const;

interface SessionKey extends GenerateKeyResponse {
  commonName: string;
  createdAt: string;
}

export function KeysPage(): JSX.Element {
  const toast = useToast();
  const generate = useGenerateKey();
  const { data: backends } = useStorageBackends();

  const [algorithm, setAlgorithm] = useState<KeyAlgorithm>('RSA');
  const [keySize, setKeySize] = useState<RsaKeySize>(2048);
  const [curve, setCurve] = useState<EcCurve>('P-256');
  const [commonName, setCommonName] = useState('');
  const [organization, setOrganization] = useState('360DigitalTrust');
  const [email, setEmail] = useState('');
  const [useVault, setUseVault] = useState(false);
  const [keys, setKeys] = useState<SessionKey[]>([]);

  const vaultAvailable = backends?.vault?.available ?? false;

  const storageOptions = [
    { value: 'local', label: backends?.local?.label ?? 'Stockage local (volume API)' },
    {
      value: 'vault',
      label: vaultAvailable
        ? (backends?.vault?.label ?? 'HashiCorp Vault')
        : 'HashiCorp Vault — non démarré',
      disabled: !vaultAvailable,
    },
  ];

  const submit = async (): Promise<void> => {
    const name = commonName.trim();
    if (name === '') return;

    try {
      const result = await generate.mutateAsync({
        algorithm,
        common_name: name,
        organization: organization.trim() || '360DigitalTrust',
        country: 'FR',
        email: email.trim() || null,
        store_in_vault: useVault,
        ...(algorithm === 'RSA' ? { key_size: keySize } : { curve }),
      });

      setKeys((list) => [
        { ...result, commonName: name, createdAt: new Date().toISOString() },
        ...list,
      ]);
      setCommonName('');
      toast.success(
        'Clé générée',
        'Conservez son identifiant : il est nécessaire pour signer.',
      );
    } catch (e) {
      toast.error('Génération impossible', toToastText(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Clés & certificats"
        description="Générez une paire de clés et la demande de certificat correspondante."
      />

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Formulaire */}
        <Card className="lg:col-span-2">
          <CardHeader title="Générer une paire de clés" />
          <CardBody className="flex flex-col gap-4">
            <InputField
              label="Nom du porteur"
              value={commonName}
              onChange={(e) => setCommonName(e.target.value)}
              placeholder="Alice Martin"
              hint="Figure dans le sujet du certificat (Common Name)."
              autoComplete="name"
              required
            />

            <InputField
              label="Organisation"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              autoComplete="organization"
            />

            <InputField
              label="Adresse e-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alice.martin@exemple.fr"
              hint="Facultatif."
              autoComplete="email"
            />

            <SelectField
              label="Algorithme"
              options={ALGORITHMS}
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value as KeyAlgorithm)}
            />

            {algorithm === 'RSA' ? (
              <SelectField
                label="Taille de clé"
                options={RSA_SIZES}
                value={String(keySize)}
                onChange={(e) => setKeySize(Number(e.target.value) as RsaKeySize)}
              />
            ) : (
              <SelectField
                label="Courbe elliptique"
                options={EC_CURVES}
                value={curve}
                onChange={(e) => setCurve(e.target.value as EcCurve)}
              />
            )}

            <SelectField
              label="Stockage de la clé privée"
              options={storageOptions}
              value={useVault ? 'vault' : 'local'}
              onChange={(e) => setUseVault(e.target.value === 'vault')}
              hint={
                vaultAvailable
                  ? 'La clé privée reste côté serveur ; elle ne vous est jamais transmise.'
                  : "Vault n'est pas démarré sur cette installation."
              }
            />

            <Button
              variant="primary"
              onClick={() => void submit()}
              loading={generate.isPending}
              disabled={commonName.trim() === ''}
            >
              <Plus aria-hidden />
              Générer la clé
            </Button>
          </CardBody>
        </Card>

        {/* Clés de la session */}
        <div className="flex flex-col gap-5 lg:col-span-3">
          <Card>
            <CardHeader
              title="Clés générées"
              description="Depuis l'ouverture de cette page"
            />
            {keys.length === 0 ? (
              <EmptyState
                icon={KeyRound}
                title="Aucune clé générée"
                description="Renseignez le formulaire pour créer votre première paire de clés."
              />
            ) : (
              <CardBody className="flex flex-col gap-4">
                {keys.map((key) => (
                  <div
                    key={key.key_id}
                    className="rounded-lg border border-line bg-ground/40 p-4"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-base font-medium text-ink">
                        {key.commonName}
                      </span>
                      <Badge tone="accent">{key.algorithm}</Badge>
                      <Badge tone={key.storage === 'vault' ? 'success' : 'neutral'}>
                        {key.storage === 'vault' ? 'Vault' : 'Stockage local'}
                      </Badge>
                    </div>

                    <dl>
                      <DetailRow label="Identifiant de clé">
                        <MonoValue value={key.key_id} label="l'identifiant de clé" />
                      </DetailRow>
                      <DetailRow label="Générée le">
                        {formatDateTime(key.createdAt)}
                      </DetailRow>
                      <DetailRow label="Demande de certificat">
                        <MonoValue
                          value={key.csr_pem}
                          display="CSR PKCS#10 — copier"
                          label="la demande de certificat"
                        />
                      </DetailRow>
                    </dl>
                  </div>
                ))}
              </CardBody>
            )}
          </Card>

          <Card>
            <CardBody className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <div className="text-sm text-slate">
                <p className="font-medium text-ink">
                  Notez les identifiants de clé avant de quitter cette page.
                </p>
                <p className="mt-1">
                  La plateforme n'expose pas d'inventaire des clés : une fois cette
                  page fermée, l'identifiant ne peut plus être retrouvé depuis
                  l'interface. Associez la clé à un signataire pour la conserver.
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              <p className="text-sm text-slate">
                La clé privée est générée et conservée côté serveur. Elle n'est jamais
                transmise au navigateur : seule la demande de certificat (CSR) vous est
                remise, pour la faire signer par votre autorité de certification.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
