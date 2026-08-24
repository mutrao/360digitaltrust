/**
 * Client HTTP typé — point de passage unique vers le backend.
 *
 * Aucun composant n'appelle `fetch` directement : cela garantit que
 * l'authentification, la gestion d'erreur et les délais sont traités
 * de façon homogène.
 */
import { getConfig } from '@/lib/config';
import { ApiError, NetworkError } from './errors';

/** Fournisseur de jeton, injecté par la couche d'authentification. */
type TokenProvider = () => string | null;

let getToken: TokenProvider = () => null;
let onUnauthorized: (() => void) | null = null;

export function setTokenProvider(fn: TokenProvider): void {
  getToken = fn;
}

/** Appelé sur 401 : la couche auth déclenche un renouvellement ou une reconnexion. */
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

const DEFAULT_TIMEOUT_MS = 30_000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = getConfig().apiBaseUrl.replace(/\/+$/, '');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/** Extrait le détail d'erreur FastAPI (`detail`, éventuellement structuré). */
async function extractDetail(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (typeof data === 'string') return data;
    if (data && typeof data === 'object' && 'detail' in data) {
      const d = (data as { detail: unknown }).detail;
      if (typeof d === 'string') return d;
      // 422 de Pydantic : liste d'objets { loc, msg, type }
      if (Array.isArray(d)) {
        return d
          .map((item) =>
            item && typeof item === 'object' && 'msg' in item
              ? String((item as { msg: unknown }).msg)
              : '',
          )
          .filter(Boolean)
          .join(' · ');
      }
    }
    return '';
  } catch {
    return '';
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
  const url = buildUrl(path, query);

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  // Le backend ignore encore l'en-tête (voir BACKEND_INTEGRATION.md §3.1),
  // mais le frontend l'envoie dès aujourd'hui pour que l'activation
  // côté serveur ne demande aucune modification ici.
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: 'omit',
    });
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    throw new NetworkError(url, aborted ? 'Délai dépassé' : 'Connexion impossible');
  } finally {
    window.clearTimeout(timer);
  }

  if (res.status === 401 && onUnauthorized) onUnauthorized();

  if (!res.ok) {
    throw new ApiError(res.status, await extractDetail(res), url);
  }

  if (res.status === 204) return undefined as T;

  // Toutes les routes consommées ici renvoient du JSON. Une réponse d'un autre
  // type signifie qu'on ne parle pas au backend attendu — typiquement la page
  // HTML d'un reverse proxy mal configuré. La rendre telle quelle donnerait
  // une valeur qui ment sur son type et casserait un composant plus loin, sans
  // rapport visible avec la cause.
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(
      res.status,
      "Réponse inattendue : le service n'a pas renvoyé de JSON.",
      url,
    );
  }
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'POST', body, query }),
  put: <T>(path: string, body?: unknown, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'PUT', body, query }),
  del: <T>(path: string, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'DELETE', query }),
};
