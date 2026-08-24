/**
 * Annuaire des signataires.
 *
 * Ce ne sont pas des comptes : ils ne portent ni mot de passe ni droit.
 * Les comptes viennent de Keycloak ; cet annuaire sert à pré-remplir les
 * demandes et à rattacher une identité de signature (clé + certificat).
 */
import { useMemo, useState } from 'react';
import { Info, Plus, Search, UserPlus, Users } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card, CardBody, PageHeader } from '@/components/ui/Card';
import { Badge, UserStatusBadge } from '@/components/ui/Badge';
import { Avatar, MonoValue, Table, Td, Th, Tr } from '@/components/ui/Data';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { InputField, SelectField, TextareaField } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonTable } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import {
  useAttachCertificate,
  useCreateUser,
  useDeactivateUser,
  useUsers,
} from '@/hooks/queries';
import { formatDate } from '@/lib/utils';
import { toToastText } from '@/services/api/errors';
import type { AppUser, SignerRole } from '@/types/api';

const ROLES = [
  { value: 'signer', label: 'Signataire' },
  { value: 'admin', label: 'Administrateur' },
  { value: 'auditor', label: 'Auditeur' },
] as const;

const ROLE_LABEL: Record<SignerRole, string> = {
  signer: 'Signataire',
  admin: 'Administrateur',
  auditor: 'Auditeur',
};

export function SignersPage(): JSX.Element {
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useUsers();
  const createUser = useCreateUser();
  const deactivate = useDeactivateUser();
  const attach = useAttachCertificate();

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [toDeactivate, setToDeactivate] = useState<AppUser | null>(null);
  const [toAttach, setToAttach] = useState<AppUser | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'signer' as SignerRole,
    organization: '',
  });
  const [identity, setIdentity] = useState({ keyId: '', pem: '' });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const users = data?.users ?? [];
    if (term === '') return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.organization.toLowerCase().includes(term),
    );
  }, [data, search]);

  const submitCreate = async (): Promise<void> => {
    try {
      await createUser.mutateAsync({
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        organization: form.organization.trim(),
      });
      toast.success('Signataire ajouté', `${form.name.trim()} figure désormais dans l'annuaire.`);
      setForm({ name: '', email: '', role: 'signer', organization: '' });
      setCreateOpen(false);
    } catch (e) {
      toast.error('Ajout impossible', toToastText(e));
    }
  };

  const submitDeactivate = async (): Promise<void> => {
    if (!toDeactivate) return;
    try {
      await deactivate.mutateAsync(toDeactivate.id);
      toast.success('Signataire désactivé', 'Il ne peut plus être ajouté à une demande.');
      setToDeactivate(null);
    } catch (e) {
      toast.error('Désactivation impossible', toToastText(e));
    }
  };

  const submitAttach = async (): Promise<void> => {
    if (!toAttach) return;
    try {
      await attach.mutateAsync({
        id: toAttach.id,
        keyId: identity.keyId.trim(),
        pem: identity.pem.trim(),
      });
      toast.success('Identité rattachée', `${toAttach.name} peut désormais signer.`);
      setIdentity({ keyId: '', pem: '' });
      setToAttach(null);
    } catch (e) {
      toast.error('Rattachement impossible', toToastText(e));
    }
  };

  const createValid =
    form.name.trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const attachValid =
    identity.keyId.trim() !== '' && identity.pem.includes('BEGIN CERTIFICATE');

  return (
    <>
      <PageHeader
        title="Signataires"
        description="Annuaire des personnes pouvant être ajoutées à une demande de signature."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <UserPlus aria-hidden />
            Ajouter un signataire
          </Button>
        }
      />

      <Card className="mb-5">
        <CardBody className="flex items-start gap-3 py-4">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <p className="text-sm text-slate">
            Cet annuaire ne gère pas les accès à l'application. Les comptes et leurs
            droits proviennent de votre annuaire d'entreprise via Keycloak.
          </p>
        </CardBody>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-3">
          <div className="relative max-w-xs">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un signataire…"
              aria-label="Rechercher un signataire"
              className="h-8 w-full rounded border border-line bg-surface pl-8 pr-3 text-sm text-ink placeholder:text-muted"
            />
          </div>
        </div>

        {isLoading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? 'Aucun résultat' : 'Annuaire vide'}
            description={
              search
                ? 'Aucun signataire ne correspond à votre recherche.'
                : 'Ajoutez les personnes qui devront signer vos documents.'
            }
            action={
              search ? (
                <Button variant="secondary" size="sm" onClick={() => setSearch('')}>
                  Effacer la recherche
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden />
                  Ajouter un signataire
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Signataire</Th>
                <Th>Rôle</Th>
                <Th>Identité de signature</Th>
                <Th>Statut</Th>
                <Th>Ajouté le</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => (
                <Tr key={user.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={user.name} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{user.name}</p>
                        <p className="truncate text-sm text-muted">{user.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <span className="text-base text-slate">{ROLE_LABEL[user.role]}</span>
                    {user.organization ? (
                      <p className="text-sm text-muted">{user.organization}</p>
                    ) : null}
                  </Td>
                  <Td>
                    {user.key_id ? (
                      <MonoValue
                        value={user.key_id}
                        display={`${user.key_id.slice(0, 8)}…`}
                        label="l'identifiant de clé"
                      />
                    ) : (
                      <Badge tone="warning">Aucune clé</Badge>
                    )}
                  </Td>
                  <Td>
                    <UserStatusBadge status={user.status} />
                  </Td>
                  <Td>
                    <span className="whitespace-nowrap text-sm text-slate">
                      {formatDate(user.created_at)}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setToAttach(user)}
                      >
                        {user.key_id ? 'Modifier la clé' : 'Rattacher une clé'}
                      </Button>
                      {user.status === 'active' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToDeactivate(user)}
                        >
                          Désactiver
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Ajout */}
      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Ajouter un signataire"
        description="Cette personne pourra être désignée dans vos demandes de signature."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => void submitCreate()}
              loading={createUser.isPending}
              disabled={!createValid}
            >
              Ajouter
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <InputField
            label="Nom complet"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Alice Martin"
            autoComplete="name"
            required
          />
          <InputField
            label="Adresse e-mail"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="alice.martin@exemple.fr"
            autoComplete="email"
            required
            error={
              form.email !== '' && !createValid && form.name.trim() !== ''
                ? 'Adresse e-mail invalide.'
                : undefined
            }
          />
          <InputField
            label="Organisation"
            value={form.organization}
            onChange={(e) => setForm({ ...form, organization: e.target.value })}
            placeholder="Direction juridique"
            autoComplete="organization"
          />
          <SelectField
            label="Rôle"
            options={ROLES}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as SignerRole })}
            hint="Information indicative : les droits réels viennent de Keycloak."
          />
        </div>
      </Dialog>

      {/* Rattachement d'identité */}
      <Dialog
        open={toAttach !== null}
        onOpenChange={(open) => {
          if (!open) setToAttach(null);
        }}
        title="Rattacher une identité de signature"
        description={
          toAttach
            ? `Clé et certificat qui représenteront ${toAttach.name}.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setToAttach(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => void submitAttach()}
              loading={attach.isPending}
              disabled={!attachValid}
            >
              Rattacher
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <InputField
            label="Identifiant de clé"
            value={identity.keyId}
            onChange={(e) => setIdentity({ ...identity, keyId: e.target.value })}
            placeholder="00000000-0000-…"
            hint="Généré dans Clés & certificats."
            autoComplete="off"
            spellCheck={false}
            required
            mono
          />
          <TextareaField
            label="Certificat (PEM)"
            value={identity.pem}
            onChange={(e) => setIdentity({ ...identity, pem: e.target.value })}
            placeholder="-----BEGIN CERTIFICATE-----"
            rows={6}
            required
            mono
            error={
              identity.pem !== '' && !identity.pem.includes('BEGIN CERTIFICATE')
                ? 'Ce texte ne ressemble pas à un certificat PEM.'
                : undefined
            }
          />
        </div>
      </Dialog>

      <ConfirmDialog
        open={toDeactivate !== null}
        onOpenChange={(open) => {
          if (!open) setToDeactivate(null);
        }}
        title="Désactiver ce signataire ?"
        description={
          toDeactivate ? (
            <>
              {toDeactivate.name} ne pourra plus être ajouté à de nouvelles demandes.
              Ses signatures déjà apposées restent valides et tracées.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Désactiver"
        destructive
        loading={deactivate.isPending}
        onConfirm={submitDeactivate}
      />
    </>
  );
}
