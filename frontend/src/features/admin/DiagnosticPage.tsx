/**
 * Diagnostic d'installation — l'écran le plus utile en On-Premise.
 *
 * Chaque contrôle est réel : rien n'est affiché « vert » sans avoir été
 * effectivement vérifié. Aucun secret n'est jamais rendu.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { MonoValue } from '@/components/ui/Data';
import { BUILD, getConfig, isKeycloakConfigured } from '@/lib/config';
import { isCryptoAvailable } from '@/lib/crypto';
import { useCapabilities, useHealth } from '@/hooks/queries';
import { useAuth } from '@/services/auth/AuthProvider';

type CheckState = 'ok' | 'warn' | 'fail' | 'pending' | 'skip';

interface Check {
  label: string;
  state: CheckState;
  detail: string;
}

const ICON: Record<CheckState, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
  pending: RefreshCw,
  skip: HelpCircle,
};

const COLOR: Record<CheckState, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  fail: 'text-danger',
  pending: 'text-muted animate-spin',
  skip: 'text-muted',
};

function CheckRow({ label, state, detail }: Check): JSX.Element {
  const Icon = ICON[state];
  return (
    <li className="flex items-start gap-3 border-b border-line py-3 last:border-0">
      <Icon className={`mt-0.5 size-4 shrink-0 ${COLOR[state]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-base text-ink">{label}</p>
        <p className="mt-0.5 break-words text-sm text-slate">{detail}</p>
      </div>
    </li>
  );
}

export function DiagnosticPage(): JSX.Element {
  const config = getConfig();
  const { mode, status, principal } = useAuth();
  const health = useHealth();
  const capabilities = useCapabilities();

  const [oidcCheck, setOidcCheck] = useState<Check>({
    label: 'Découverte OIDC',
    state: 'pending',
    detail: 'Vérification en cours…',
  });

  /** Interroge le document de découverte du realm — sans jeton, sans secret. */
  const probeOidc = useCallback(async () => {
    if (!isKeycloakConfigured(config)) {
      setOidcCheck({
        label: 'Découverte OIDC',
        state: 'skip',
        detail: 'Keycloak non configuré sur cette installation.',
      });
      return;
    }

    const url =
      `${config.keycloak.url}/realms/` +
      `${encodeURIComponent(config.keycloak.realm)}/.well-known/openid-configuration`;

    setOidcCheck({ label: 'Découverte OIDC', state: 'pending', detail: url });

    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        setOidcCheck({
          label: 'Découverte OIDC',
          state: 'fail',
          detail: `Le realm « ${config.keycloak.realm} » a répondu ${res.status}. Vérifiez son nom et son activation.`,
        });
        return;
      }
      const doc = (await res.json()) as { issuer?: string };
      setOidcCheck({
        label: 'Découverte OIDC',
        state: 'ok',
        detail: `Émetteur : ${doc.issuer ?? 'inconnu'}`,
      });
    } catch {
      setOidcCheck({
        label: 'Découverte OIDC',
        state: 'fail',
        detail:
          "Keycloak est injoignable depuis le navigateur. Vérifiez l'URL, le certificat TLS et la configuration CORS du realm.",
      });
    }
  }, [config]);

  useEffect(() => {
    void probeOidc();
  }, [probeOidc]);

  const refreshAll = (): void => {
    void health.refetch();
    void capabilities.refetch();
    void probeOidc();
  };

  const platform: Check[] = [
    {
      label: 'Interface web',
      state: 'ok',
      detail: `Version ${BUILD.version} · révision ${BUILD.commit}`,
    },
    {
      label: 'Contexte sécurisé (HTTPS)',
      state: isCryptoAvailable() ? 'ok' : 'fail',
      detail: isCryptoAvailable()
        ? "L'API Web Crypto est disponible : les empreintes sont calculées localement."
        : "Web Crypto est indisponible. La signature ne fonctionnera pas tant que l'application n'est pas servie en HTTPS.",
    },
    {
      label: 'Service de signature',
      state: health.isLoading ? 'pending' : health.isError ? 'fail' : 'ok',
      detail: health.isError
        ? `Injoignable à l'adresse ${config.apiBaseUrl}.`
        : health.data
          ? `Actif · version ${health.data.version}`
          : 'Interrogation en cours…',
    },
    {
      label: 'Capacités déclarées',
      state: capabilities.isLoading
        ? 'pending'
        : capabilities.isError
          ? 'warn'
          : 'ok',
      detail: capabilities.data
        ? `${Object.values(capabilities.data.features).filter(Boolean).length} fonctionnalités actives`
        : "Le backend n'expose pas /v1/capabilities.",
    },
    {
      label: 'Coffre-fort Vault',
      state: capabilities.data
        ? capabilities.data.storage?.vault_available
          ? 'ok'
          : 'warn'
        : 'pending',
      detail: capabilities.data?.storage?.vault_available
        ? 'Disponible : les clés privées peuvent y être stockées.'
        : "Non démarré. Les clés privées sont conservées sur le volume local du service.",
    },
  ];

  const authentication: Check[] = [
    {
      label: 'Configuration Keycloak',
      state: mode === 'oidc' ? 'ok' : 'warn',
      detail:
        mode === 'oidc'
          ? `${config.keycloak.url} · realm « ${config.keycloak.realm} » · client « ${config.keycloak.clientId} »`
          : "Aucune configuration fournie. L'application démarre sans restriction d'accès.",
    },
    oidcCheck,
    {
      label: 'Session en cours',
      state: status === 'authenticated' ? 'ok' : mode === 'oidc' ? 'warn' : 'skip',
      detail:
        status === 'authenticated' && principal
          ? `${principal.username} · rôle ${principal.role}`
          : mode === 'oidc'
            ? 'Aucune session active.'
            : "Sans Keycloak, aucune identité n'est vérifiée.",
    },
    {
      label: 'Validation des jetons par le backend',
      state: 'fail',
      detail:
        "Le service de signature ne vérifie pas l'en-tête Authorization : ses routes sont accessibles sans jeton. " +
        'Les restrictions visibles dans cette interface sont ergonomiques, pas sécuritaires.',
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Avertissement de sécurité — la vérité prime sur le confort. */}
      <Card className="border-warning/40">
        <CardBody className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="text-base font-medium text-ink">
              Cette installation n'applique pas de contrôle d'accès côté serveur.
            </p>
            <p className="mt-1 text-sm text-slate">
              L'interface envoie bien le jeton Keycloak à chaque appel, mais le service
              de signature ne le vérifie pas encore. Tant que cette validation n'est pas
              activée, considérez l'API comme publique et protégez-la au niveau réseau
              (reverse proxy, filtrage IP, VPN). La marche à suivre est décrite dans
              <span className="font-mono text-sm"> docs/BACKEND_INTEGRATION.md</span>.
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Plateforme"
          action={
            <Button variant="secondary" size="sm" onClick={refreshAll}>
              <RefreshCw aria-hidden />
              Relancer les contrôles
            </Button>
          }
        />
        <CardBody className="py-0">
          <ul>
            {platform.map((check) => (
              <CheckRow key={check.label} {...check} />
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Authentification" />
        <CardBody className="py-0">
          <ul>
            {authentication.map((check) => (
              <CheckRow key={check.label} {...check} />
            ))}
          </ul>
        </CardBody>
      </Card>

      {capabilities.data ? (
        <Card>
          <CardHeader
            title="Fonctionnalités du backend"
            description="Les fonctionnalités inactives sont masquées dans la navigation."
          />
          <CardBody>
            <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {Object.entries(capabilities.data.features).map(([name, enabled]) => (
                <li key={name} className="flex items-center gap-2 text-sm">
                  {enabled ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden />
                  ) : (
                    <XCircle className="size-3.5 shrink-0 text-muted" aria-hidden />
                  )}
                  <span className={enabled ? 'text-ink' : 'text-muted'}>{name}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Configuration effective" />
        <CardBody className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            Valeurs lues au démarrage depuis <span className="font-mono">
              /config/runtime-config.json
            </span>. Aucun secret n'est stocké côté navigateur.
          </p>
          <MonoValue
            value={JSON.stringify(
              {
                apiBaseUrl: config.apiBaseUrl,
                keycloak: {
                  url: config.keycloak.url || null,
                  realm: config.keycloak.realm || null,
                  clientId: config.keycloak.clientId || null,
                },
                branding: { companyName: config.branding.companyName },
                build: BUILD,
              },
              null,
              2,
            )}
            display="Copier la configuration (sans secret)"
            label="la configuration"
          />
        </CardBody>
      </Card>
    </div>
  );
}
