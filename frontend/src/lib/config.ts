/**
 * Configuration runtime.
 *
 * Rien de spécifique à un client n'est compilé dans le bundle : le fichier
 * `/config/runtime-config.json` est lu avant le montage de React, et
 * l'entrypoint Docker le régénère à chaque démarrage depuis les variables
 * d'environnement. Une seule image sert donc tous les déploiements.
 */

export interface KeycloakConfig {
  /** Vide = Keycloak non configuré ; l'application démarre en mode bootstrap. */
  url: string;
  realm: string;
  clientId: string;
  /** Portées OIDC demandées. Aucun secret : flux Code + PKCE. */
  scope?: string;
}

export interface BrandingConfig {
  companyName: string;
  productName: string;
  /** URL du logo, servie par le même hôte. Vide = monogramme généré. */
  logoUrl?: string;
  /** Couleur d'accent au format `r g b`, ex. « 27 95 168 ». */
  accentRgb?: string;
  supportEmail?: string;
  legalNoticeUrl?: string;
}

export interface RuntimeConfig {
  apiBaseUrl: string;
  keycloak: KeycloakConfig;
  branding: BrandingConfig;
  /** `fr` par défaut. */
  defaultLocale: 'fr' | 'en';
}

const FALLBACK: RuntimeConfig = {
  apiBaseUrl: '/api',
  keycloak: { url: '', realm: '', clientId: '', scope: 'openid profile email' },
  branding: {
    companyName: '360DigitalTrust',
    productName: 'Signature électronique',
    accentRgb: '27 95 168',
  },
  defaultLocale: 'fr',
};

let cache: RuntimeConfig | null = null;

/** Sécurise une URL fournie par la configuration : http(s) uniquement. */
function safeUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return '';
  const trimmed = value.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? trimmed : '';
  } catch {
    return '';
  }
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/** Valide « r g b ». Empêche l'injection de CSS arbitraire via le branding. */
function safeRgb(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 3) return fallback;
  const valid = parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
  return valid ? parts.join(' ') : fallback;
}

function normalise(raw: unknown): RuntimeConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  const kc = (o.keycloak ?? {}) as Record<string, unknown>;
  const br = (o.branding ?? {}) as Record<string, unknown>;

  return {
    apiBaseUrl: safeUrl(o.apiBaseUrl) || FALLBACK.apiBaseUrl,
    keycloak: {
      url: safeUrl(kc.url),
      realm: str(kc.realm),
      clientId: str(kc.clientId),
      scope: str(kc.scope, 'openid profile email'),
    },
    branding: {
      companyName: str(br.companyName, FALLBACK.branding.companyName),
      productName: str(br.productName, FALLBACK.branding.productName),
      logoUrl: safeUrl(br.logoUrl),
      accentRgb: safeRgb(br.accentRgb, FALLBACK.branding.accentRgb as string),
      supportEmail: str(br.supportEmail),
      legalNoticeUrl: safeUrl(br.legalNoticeUrl),
    },
    defaultLocale: o.defaultLocale === 'en' ? 'en' : 'fr',
  };
}

/** Charge la configuration. Appelé une fois, avant le montage de React. */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cache) return cache;
  try {
    const res = await fetch('/config/runtime-config.json', { cache: 'no-store' });
    cache = res.ok ? normalise(await res.json()) : FALLBACK;
  } catch {
    // Fichier absent en développement : les valeurs par défaut suffisent.
    cache = FALLBACK;
  }
  applyBranding(cache);
  return cache;
}

/** Accès synchrone après chargement. */
export function getConfig(): RuntimeConfig {
  if (!cache) throw new Error('loadRuntimeConfig() doit être appelé avant getConfig()');
  return cache;
}

export function isKeycloakConfigured(cfg: RuntimeConfig = getConfig()): boolean {
  return Boolean(cfg.keycloak.url && cfg.keycloak.realm && cfg.keycloak.clientId);
}

/** Applique le branding via les variables CSS — jamais via du CSS injecté. */
function applyBranding(cfg: RuntimeConfig): void {
  const root = document.documentElement;
  if (cfg.branding.accentRgb) {
    root.style.setProperty('--c-accent', cfg.branding.accentRgb);
  }
  document.title = `${cfg.branding.productName} — ${cfg.branding.companyName}`;
}

export const BUILD = {
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
  date: __BUILD_DATE__,
} as const;
