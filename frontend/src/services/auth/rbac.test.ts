import { describe, expect, it } from 'vitest';

import { highestRole, mapRealmRoles, permissionsFor } from './rbac';

describe('correspondance des rôles Keycloak', () => {
  it('reconnaît les rôles quels que soient la casse et les préfixes usuels', () => {
    expect(mapRealmRoles(['ADMIN'])).toContain('ADMIN');
    expect(mapRealmRoles(['ROLE_admin'])).toContain('ADMIN');
    expect(mapRealmRoles(['esign-admin'])).toContain('ADMIN');
    expect(mapRealmRoles(['Manager'])).toContain('MANAGER');
    expect(mapRealmRoles(['signer'])).toContain('USER');
  });

  it('accorde au minimum le rôle utilisateur à tout jeton valide', () => {
    expect(mapRealmRoles([])).toEqual(['USER']);
    expect(mapRealmRoles(['offline_access', 'uma_authorization'])).toEqual(['USER']);
  });

  it('retient le rôle le plus élevé', () => {
    expect(highestRole(['USER', 'ADMIN'])).toBe('ADMIN');
    expect(highestRole(['USER', 'MANAGER'])).toBe('MANAGER');
    expect(highestRole(['USER'])).toBe('USER');
  });
});

describe('permissions', () => {
  it("n'accorde pas l'administration à un simple utilisateur", () => {
    const permissions = permissionsFor(['USER']);
    expect(permissions.has('admin:access')).toBe(false);
    expect(permissions.has('signer:manage')).toBe(false);
    expect(permissions.has('request:create')).toBe(true);
  });

  it('accorde la gestion des signataires au responsable, pas la configuration', () => {
    const permissions = permissionsFor(['MANAGER']);
    expect(permissions.has('signer:manage')).toBe(true);
    expect(permissions.has('audit:view')).toBe(true);
    expect(permissions.has('admin:configure')).toBe(false);
  });

  it("cumule les permissions lorsqu'un compte porte plusieurs rôles", () => {
    const permissions = permissionsFor(['USER', 'ADMIN']);
    expect(permissions.has('admin:configure')).toBe(true);
    expect(permissions.has('request:create')).toBe(true);
  });
});
