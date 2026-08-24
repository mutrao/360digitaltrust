/**
 * Pages d'administration en lecture.
 *
 * Le backend n'expose aucune route d'écriture de configuration : ces écrans
 * montrent la configuration effective et expliquent comment la modifier
 * (fichier runtime, variables d'environnement, console Keycloak). Aucun
 * formulaire n'est présenté s'il ne peut rien enregistrer.
 */
import { Building2, ExternalLink, FileCode2, Network, ShieldCheck } from 'lucide-react';

import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DetailRow, MonoValue } from '@/components/ui/Data';
import { BUILD, getConfig, isKeycloakConfigured } from '@/lib/config';
import { useCapabilities, useHealth } from '@/hooks/queries';

/** Encadré expliquant où se modifie un réglage non éditable depuis l'interface. */
function ConfigNotice({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-start gap-3 rounded border border-line bg-ground p-3">
      <FileCode2 className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <div className="text-sm text-slate">{children}</div>
    </div>
  );
}

// ── Organisation ─────────────────────────────────────────────────

export function AdminOrganisationPage(): JSX.Element {
  const { branding, defaultLocale, apiBaseUrl } = getConfig();

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Organisation"
          description="Identité de l'installation, telle qu'elle apparaît aux utilisateurs."
        />
        <CardBody className="py-1">
          <dl>
            <DetailRow label="Nom de l'organisation">{branding.companyName}</DetailRow>
            <DetailRow label="Nom du produit">{branding.productName}</DetailRow>
            <DetailRow label="Contact support">
              {branding.supportEmail ? (
                <a
                  href={`mailto:${branding.supportEmail}`}
                  className="text-accent underline-offset-4 hover:underline"
                >
                  {branding.supportEmail}
                </a>
              ) : (
                <span className="text-muted">Non renseigné</span>
              )}
            </DetailRow>
            <DetailRow label="Mentions légales">
              {branding.legalNoticeUrl ? (
                <a
                  href={branding.legalNoticeUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-accent underline-offset-4 hover:underline"
                >
                  Consulter
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : (
                <span className="text-muted">Non renseignées</span>
              )}
            </DetailRow>
            <DetailRow label="Langue par défaut">
              {defaultLocale === 'fr' ? 'Français' : 'Anglais'}
            </DetailRow>
            <DetailRow label="Service de signature">
              <MonoValue value={apiBaseUrl} copyable={false} />
            </DetailRow>
          </dl>
        </CardBody>
      </Card>

      <ConfigNotice>
        Ces valeurs proviennent du fichier{' '}
        <span className="font-mono">/config/runtime-config.json</span>, régénéré au
        démarrage du conteneur depuis les variables d'environnement. Modifiez-les dans
        votre <span className="font-mono">docker-compose.yml</span> puis redémarrez le
        service — aucune reconstruction d'image n'est nécessaire. Voir{' '}
        <span className="font-mono">docs/CONFIGURATION.md</span>.
      </ConfigNotice>
    </div>
  );
}

// ── Authentification ─────────────────────────────────────────────

export function AdminAuthPage(): JSX.Element {
  const config = getConfig();
  const configured = isKeycloakConfigured(config);
  const adminConsole = configured
    ? `${config.keycloak.url}/admin/master/console/#/${encodeURIComponent(config.keycloak.realm)}`
    : null;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Keycloak"
          description="Fournisseur d'identité de la plateforme."
          action={
            configured ? (
              <Badge tone="success" dot>
                Configuré
              </Badge>
            ) : (
              <Badge tone="warning" dot>
                Non configuré
              </Badge>
            )
          }
        />
        <CardBody className="py-1">
          <dl>
            <DetailRow label="URL du serveur">
              {config.keycloak.url ? (
                <MonoValue value={config.keycloak.url} copyable={false} />
              ) : (
                <span className="text-muted">Non renseignée</span>
              )}
            </DetailRow>
            <DetailRow label="Realm">
              {config.keycloak.realm || <span className="text-muted">Non renseigné</span>}
            </DetailRow>
            <DetailRow label="Identifiant client">
              {config.keycloak.clientId || (
                <span className="text-muted">Non renseigné</span>
              )}
            </DetailRow>
            <DetailRow label="Flux OIDC">
              Authorization Code + PKCE
              <span className="ml-2 text-sm text-muted">(client public, sans secret)</span>
            </DetailRow>
            <DetailRow label="URI de redirection">
              <MonoValue value={`${window.location.origin}/auth/callback`} />
            </DetailRow>
            <DetailRow label="Portées demandées">
              <span className="font-mono text-sm">{config.keycloak.scope}</span>
            </DetailRow>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Configuration attendue côté Keycloak" />
        <CardBody className="flex flex-col gap-3">
          <p className="text-sm text-slate">
            Dans la console Keycloak, le client{' '}
            <span className="font-mono">{config.keycloak.clientId || 'esign-frontend'}</span>{' '}
            doit être déclaré ainsi :
          </p>
          <ul className="flex flex-col gap-1.5 text-sm text-slate">
            {[
              ['Type de client', 'Public — un SPA ne peut protéger aucun secret'],
              ['Standard flow', 'Activé'],
              ['Direct access grants', 'Désactivé'],
              ['PKCE Code Challenge Method', 'S256'],
              ['Valid redirect URIs', `${window.location.origin}/auth/callback`],
              ['Valid post logout redirect URIs', window.location.origin],
              ['Web origins', window.location.origin],
            ].map(([label, value]) => (
              <li key={label} className="flex flex-wrap gap-x-2">
                <span className="font-medium text-ink">{label} :</span>
                <span className="font-mono">{value}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-slate">
            Les rôles de realm <span className="font-mono">user</span>,{' '}
            <span className="font-mono">manager</span> et{' '}
            <span className="font-mono">admin</span> sont reconnus par l'application.
          </p>
          {adminConsole ? (
            <a
              href={adminConsole}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              Ouvrir la console d'administration Keycloak
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Active Directory"
          description="Intégration de votre annuaire d'entreprise."
        />
        <CardBody className="flex flex-col gap-3">
          <p className="text-sm text-slate">
            L'application ne communique jamais directement avec Active Directory. La
            fédération se configure dans Keycloak, qui expose ensuite les identités par
            OIDC :
          </p>
          <div className="flex flex-wrap items-center gap-2 rounded border border-line bg-ground px-3 py-2.5 font-mono text-sm text-slate">
            <Network className="size-3.5 shrink-0 text-muted" aria-hidden />
            Active Directory → LDAP federation → Keycloak → OIDC → Application → API
          </div>
          <p className="text-sm text-slate">
            Dans Keycloak : <span className="font-mono">User federation</span> →{' '}
            <span className="font-mono">Add LDAP provider</span>, puis synchronisez les
            groupes vers des rôles de realm. Procédure détaillée dans{' '}
            <span className="font-mono">docs/ACTIVE_DIRECTORY.md</span>.
          </p>
        </CardBody>
      </Card>

      {!configured ? (
        <ConfigNotice>
          Pour activer l'authentification, renseignez{' '}
          <span className="font-mono">KEYCLOAK_URL</span>,{' '}
          <span className="font-mono">KEYCLOAK_REALM</span> et{' '}
          <span className="font-mono">KEYCLOAK_CLIENT_ID</span> dans l'environnement du
          conteneur, puis redémarrez-le. Tant qu'aucune valeur n'est fournie,
          l'application reste accessible sans authentification.
        </ConfigNotice>
      ) : null}
    </div>
  );
}

// ── Apparence ────────────────────────────────────────────────────

export function AdminBrandingPage(): JSX.Element {
  const { branding } = getConfig();

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Apparence"
          description="Personnalisation visuelle de l'installation."
        />
        <CardBody className="py-1">
          <dl>
            <DetailRow label="Logo">
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={`Logo ${branding.companyName}`}
                  className="h-8 rounded object-contain"
                />
              ) : (
                <span className="flex items-center gap-2">
                  <span
                    className="flex size-8 items-center justify-center rounded bg-accent text-accent-ink"
                    aria-hidden
                  >
                    <ShieldCheck className="size-4" />
                  </span>
                  <span className="text-sm text-muted">Monogramme par défaut</span>
                </span>
              )}
            </DetailRow>
            <DetailRow label="Couleur d'accent">
              <span className="flex items-center gap-2">
                <span
                  className="size-5 rounded border border-line"
                  style={{ backgroundColor: `rgb(${branding.accentRgb})` }}
                  aria-hidden
                />
                <span className="font-mono text-sm">rgb({branding.accentRgb})</span>
              </span>
            </DetailRow>
          </dl>
        </CardBody>
      </Card>

      <ConfigNotice>
        La couleur d'accent est appliquée par variable CSS et se propage à toute
        l'interface, dans les deux thèmes. Renseignez{' '}
        <span className="font-mono">BRANDING_ACCENT_RGB</span> au format{' '}
        <span className="font-mono">« 27 95 168 »</span> et{' '}
        <span className="font-mono">BRANDING_LOGO_URL</span> dans l'environnement du
        conteneur. Les valeurs invalides sont ignorées au profit du thème par défaut.
      </ConfigNotice>
    </div>
  );
}

// ── Sécurité ─────────────────────────────────────────────────────

export function AdminSecurityPage(): JSX.Element {
  const { data: caps } = useCapabilities();

  const items = [
    {
      title: 'Confidentialité des documents',
      detail:
        "Les documents ne sont jamais transmis : seule leur empreinte SHA-256 quitte le navigateur. Aucun fichier n'est stocké côté serveur.",
      state: 'ok' as const,
    },
    {
      title: 'Jetons d\'authentification',
      detail:
        "Conservés en mémoire uniquement. Aucun jeton n'est écrit dans localStorage : une faille XSS ne peut donc pas les exfiltrer depuis le stockage.",
      state: 'ok' as const,
    },
    {
      title: 'Flux OIDC',
      detail:
        "Authorization Code + PKCE, client public. Aucun secret n'est présent dans le bundle JavaScript.",
      state: 'ok' as const,
    },
    {
      title: 'Clés privées',
      detail: caps?.storage?.vault_available
        ? 'Stockées dans HashiCorp Vault. Elles ne sont jamais transmises au navigateur.'
        : "Stockées sur le volume local du service de signature (permissions 0600). Vault est recommandé en production.",
      state: caps?.storage?.vault_available ? ('ok' as const) : ('warn' as const),
    },
    {
      title: 'Contrôle d\'accès côté serveur',
      detail:
        "Absent. Le service de signature ne valide pas le jeton : ses routes sont accessibles sans authentification. Protégez-le au niveau réseau en attendant l'activation de cette vérification.",
      state: 'fail' as const,
    },
    {
      title: 'Persistance des données',
      detail:
        'Redis avec expiration : workflows 30 jours, audit 90 jours, signataires 365 jours. Sans volume persistant, un redémarrage efface ces données.',
      state: 'warn' as const,
    },
  ];

  const TONE = {
    ok: 'border-l-success',
    warn: 'border-l-warning',
    fail: 'border-l-danger',
  } as const;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Posture de sécurité"
          description="État réel de l'installation, sans complaisance."
        />
        <CardBody className="flex flex-col gap-3">
          {items.map((item) => (
            <div
              key={item.title}
              className={`border-l-2 ${TONE[item.state]} bg-ground/40 py-2 pl-3 pr-2`}
            >
              <p className="text-base font-medium text-ink">{item.title}</p>
              <p className="mt-0.5 text-sm text-slate">{item.detail}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <ConfigNotice>
        Les décisions de sécurité et leurs justifications sont documentées dans{' '}
        <span className="font-mono">docs/SECURITY.md</span>.
      </ConfigNotice>
    </div>
  );
}

// ── À propos ─────────────────────────────────────────────────────

export function AdminAboutPage(): JSX.Element {
  const health = useHealth();
  const { data: caps } = useCapabilities();

  return (
    <Card>
      <CardHeader title="Versions" />
      <CardBody className="py-1">
        <dl>
          <DetailRow label="Interface web">
            <span className="font-mono text-sm">{BUILD.version}</span>
          </DetailRow>
          <DetailRow label="Révision">
            <span className="font-mono text-sm">{BUILD.commit}</span>
          </DetailRow>
          <DetailRow label="Compilée le">
            <span className="font-mono text-sm">{BUILD.date}</span>
          </DetailRow>
          <DetailRow label="Service de signature">
            <span className="font-mono text-sm">
              {health.data?.version ?? caps?.version ?? '—'}
            </span>
          </DetailRow>
          <DetailRow label="Infrastructure PKI">
            <span className="flex items-center gap-1.5 text-sm">
              <Building2 className="size-3.5 text-muted" aria-hidden />
              EJBCA CE · SoftHSM2 · PostgreSQL · Redis
            </span>
          </DetailRow>
        </dl>
      </CardBody>
    </Card>
  );
}
