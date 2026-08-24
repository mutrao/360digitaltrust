import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DetailRow } from '@/components/ui/Data';
import { EmptyState } from '@/components/ui/States';
import { ROLE_LABEL } from '@/services/auth/rbac';
import { useAuth } from '@/services/auth/AuthProvider';
import { UserRound } from 'lucide-react';

export function SettingsPage(): JSX.Element {
  const { principal, mode } = useAuth();

  return (
    <>
      <PageHeader title="Paramètres" description="Votre compte et vos préférences." />

      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader title="Votre compte" />
          {principal ? (
            <CardBody className="py-1">
              <dl>
                <DetailRow label="Nom">{principal.displayName}</DetailRow>
                <DetailRow label="Identifiant">
                  <span className="font-mono text-sm">{principal.username}</span>
                </DetailRow>
                <DetailRow label="Adresse e-mail">
                  {principal.email || <span className="text-muted">Non renseignée</span>}
                </DetailRow>
                {principal.organization ? (
                  <DetailRow label="Organisation">{principal.organization}</DetailRow>
                ) : null}
                <DetailRow label="Rôle">
                  <span className="flex flex-wrap gap-1.5">
                    {principal.roles.map((role) => (
                      <Badge key={role} tone={role === 'ADMIN' ? 'accent' : 'neutral'}>
                        {ROLE_LABEL[role]}
                      </Badge>
                    ))}
                  </span>
                </DetailRow>
              </dl>
            </CardBody>
          ) : (
            <EmptyState
              icon={UserRound}
              title="Aucune session"
              description={
                mode === 'oidc'
                  ? 'Connectez-vous pour consulter les informations de votre compte.'
                  : "L'authentification n'est pas configurée sur cette installation."
              }
            />
          )}
        </Card>

        <Card className="mt-5">
          <CardHeader
            title="Préférences"
            description="Enregistrées dans ce navigateur uniquement."
          />
          <CardBody>
            <p className="text-sm text-slate">
              Le thème de l'interface et l'état de la navigation latérale se règlent
              depuis la barre supérieure. Ces préférences restent sur cet appareil et ne
              sont jamais transmises au serveur.
            </p>
          </CardBody>
        </Card>

        {principal ? (
          <Card className="mt-5">
            <CardHeader title="Modifier vos informations" />
            <CardBody>
              <p className="text-sm text-slate">
                Votre nom, votre adresse e-mail et votre mot de passe sont gérés par
                l'annuaire de votre organisation. Adressez-vous à votre administrateur
                pour toute modification.
              </p>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
