/**
 * Authentification OIDC (Keycloak) — Authorization Code + PKCE.
 *
 * Choix de sécurité :
 *  - aucun `client_secret` : impossible à protéger dans un SPA ;
 *  - jetons conservés **en mémoire** (`WebStorageStateStore` non utilisé pour
 *    l'access token) : un XSS ne peut pas les exfiltrer depuis localStorage ;
 *  - renouvellement silencieux avant expiration ;
 *  - si Keycloak n'est pas configuré, l'application démarre en mode bootstrap
 *    restreint plutôt que de se bloquer — voir docs/AUTHENTICATION.md.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { User, UserManager, WebStorageStateStore } from 'oidc-client-ts';

import { getConfig, isKeycloakConfigured } from '@/lib/config';
import { setTokenProvider, setUnauthorizedHandler } from '@/services/api/client';
import {
  highestRole,
  mapRealmRoles,
  permissionsFor,
  type Permission,
  type Role,
} from './rbac';

export type AuthMode = 'oidc' | 'bootstrap';
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';

export interface Principal {
  subject: string;
  username: string;
  displayName: string;
  email: string;
  organization: string;
  roles: Role[];
  role: Role;
}

interface AuthContextValue {
  mode: AuthMode;
  status: AuthStatus;
  principal: Principal | null;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
  /** Vrai tant que le backend ne valide pas les jetons. */
  isEnforcementMissing: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface RealmAccess {
  roles?: string[];
}

function principalFromUser(user: User): Principal {
  const profile = user.profile as Record<string, unknown>;
  const realmAccess = profile.realm_access as RealmAccess | undefined;
  const roles = mapRealmRoles(realmAccess?.roles ?? []);

  const username =
    (profile.preferred_username as string | undefined) ??
    (profile.email as string | undefined) ??
    user.profile.sub;

  return {
    subject: user.profile.sub,
    username,
    displayName: (profile.name as string | undefined) ?? username,
    email: (profile.email as string | undefined) ?? '',
    organization: (profile.organization as string | undefined) ?? '',
    roles,
    role: highestRole(roles),
  };
}

function buildUserManager(): UserManager {
  const { keycloak } = getConfig();
  const origin = window.location.origin;

  return new UserManager({
    authority: `${keycloak.url}/realms/${encodeURIComponent(keycloak.realm)}`,
    client_id: keycloak.clientId,
    redirect_uri: `${origin}/auth/callback`,
    post_logout_redirect_uri: origin,
    response_type: 'code', // Code + PKCE, activé par défaut par oidc-client-ts
    scope: keycloak.scope ?? 'openid profile email',
    // L'état transitoire du flux vit en sessionStorage ; le jeton, lui,
    // reste en mémoire (automaticSilentRenew le rafraîchit).
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: true,
    accessTokenExpiringNotificationTimeInSeconds: 60,
    monitorSession: false,
  });
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const configured = isKeycloakConfigured();
  const mode: AuthMode = configured ? 'oidc' : 'bootstrap';

  const managerRef = useRef<UserManager | null>(null);
  const tokenRef = useRef<string | null>(null);

  const [status, setStatus] = useState<AuthStatus>(configured ? 'loading' : 'anonymous');
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Le client HTTP lit le jeton via une référence : aucune re-création
  // du client à chaque renouvellement.
  useEffect(() => {
    setTokenProvider(() => tokenRef.current);
  }, []);

  const applyUser = useCallback((user: User | null) => {
    if (!user || user.expired) {
      tokenRef.current = null;
      setPrincipal(null);
      setStatus('anonymous');
      return;
    }
    tokenRef.current = user.access_token;
    setPrincipal(principalFromUser(user));
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    if (!configured) return;

    const manager = buildUserManager();
    managerRef.current = manager;

    const onLoaded = (user: User) => applyUser(user);
    const onUnloaded = () => applyUser(null);
    const onSilentError = (e: Error) => {
      // Le renouvellement a échoué : la session est perdue, pas l'application.
      setError(e.message);
      applyUser(null);
    };

    manager.events.addUserLoaded(onLoaded);
    manager.events.addUserUnloaded(onUnloaded);
    manager.events.addSilentRenewError(onSilentError);
    manager.events.addAccessTokenExpired(onUnloaded);

    void (async () => {
      try {
        if (window.location.pathname === '/auth/callback') {
          const user = await manager.signinRedirectCallback();
          window.history.replaceState({}, '', '/');
          applyUser(user);
          return;
        }
        applyUser(await manager.getUser());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Échec de la connexion');
        setStatus('error');
      }
    })();

    return () => {
      manager.events.removeUserLoaded(onLoaded);
      manager.events.removeUserUnloaded(onUnloaded);
      manager.events.removeSilentRenewError(onSilentError);
      manager.events.removeAccessTokenExpired(onUnloaded);
    };
  }, [configured, applyUser]);

  const login = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) return;
    try {
      await manager.signinRedirect();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion impossible');
      setStatus('error');
    }
  }, []);

  const logout = useCallback(async () => {
    const manager = managerRef.current;
    tokenRef.current = null;
    if (!manager) {
      setPrincipal(null);
      setStatus('anonymous');
      return;
    }
    await manager.signoutRedirect();
  }, []);

  // Un 401 signifie que le jeton est mort : on tente un renouvellement,
  // et à défaut on repasse en anonyme plutôt que de boucler.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      const manager = managerRef.current;
      if (!manager) return;
      void manager.signinSilent().catch(() => applyUser(null));
    });
  }, [applyUser]);

  const permissions = useMemo(
    () => permissionsFor(principal?.roles ?? (configured ? [] : ['ADMIN'])),
    [principal, configured],
  );

  const can = useCallback(
    (permission: Permission) => permissions.has(permission),
    [permissions],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      mode,
      status,
      principal,
      error,
      login,
      logout,
      can,
      isEnforcementMissing: true,
    }),
    [mode, status, principal, error, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}
