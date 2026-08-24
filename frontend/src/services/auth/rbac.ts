/**
 * Contrôle d'accès côté interface.
 *
 * AVERTISSEMENT — ce module décide de ce qui est *affiché*, jamais de ce qui
 * est *autorisé*. Tant que le backend ne valide pas le jeton
 * (voir docs/BACKEND_INTEGRATION.md §3.1), masquer un bouton n'empêche
 * personne d'appeler l'API directement. La page Diagnostic affiche cet
 * avertissement à l'administrateur.
 */

export type Role = 'USER' | 'MANAGER' | 'ADMIN';

export const ROLE_LABEL: Record<Role, string> = {
  USER: 'Utilisateur',
  MANAGER: 'Responsable',
  ADMIN: 'Administrateur',
};

export type Permission =
  | 'request:create'
  | 'request:view:own'
  | 'request:view:all'
  | 'request:cancel'
  | 'signer:manage'
  | 'key:generate'
  | 'audit:view'
  | 'admin:access'
  | 'admin:configure';

const GRANTS: Record<Role, Permission[]> = {
  USER: ['request:create', 'request:view:own', 'key:generate'],
  MANAGER: [
    'request:create',
    'request:view:own',
    'request:view:all',
    'request:cancel',
    'key:generate',
    'signer:manage',
    'audit:view',
  ],
  ADMIN: [
    'request:create',
    'request:view:own',
    'request:view:all',
    'request:cancel',
    'key:generate',
    'signer:manage',
    'audit:view',
    'admin:access',
    'admin:configure',
  ],
};

/**
 * Traduit les rôles Keycloak en rôles applicatifs.
 * Insensible à la casse et tolérant aux préfixes usuels (`ROLE_`, `esign-`).
 */
export function mapRealmRoles(realmRoles: readonly string[]): Role[] {
  const found = new Set<Role>();
  for (const raw of realmRoles) {
    const normalised = raw.toLowerCase().replace(/^role_/, '').replace(/^esign[-_]/, '');
    if (normalised === 'admin' || normalised === 'esign-admin') found.add('ADMIN');
    else if (normalised === 'manager') found.add('MANAGER');
    else if (normalised === 'user' || normalised === 'signer') found.add('USER');
  }
  // Tout porteur d'un jeton valide est au minimum utilisateur.
  if (found.size === 0) found.add('USER');
  return [...found];
}

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const permission of GRANTS[role]) set.add(permission);
  }
  return set;
}

export function highestRole(roles: readonly Role[]): Role {
  if (roles.includes('ADMIN')) return 'ADMIN';
  if (roles.includes('MANAGER')) return 'MANAGER';
  return 'USER';
}
