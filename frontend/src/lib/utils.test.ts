import { describe, expect, it } from 'vitest';

import { formatBytes, hueFromString, initials, isExpired } from './utils';

describe('utilitaires d’affichage', () => {
  it('détecte une échéance dépassée', () => {
    expect(isExpired('2020-01-01T00:00:00Z')).toBe(true);
    expect(isExpired('2999-01-01T00:00:00Z')).toBe(false);
    // Une demande sans échéance n'expire jamais.
    expect(isExpired(null)).toBe(false);
    expect(isExpired(undefined)).toBe(false);
    expect(isExpired('pas une date')).toBe(false);
  });

  it('calcule des initiales lisibles', () => {
    expect(initials('Alice Martin')).toBe('AM');
    expect(initials('Jean-Pierre de La Fontaine')).toBe('JF');
    expect(initials('alice')).toBe('AL');
    expect(initials('   ')).toBe('?');
  });

  it('formate les tailles en unités françaises', () => {
    expect(formatBytes(512)).toBe('512 o');
    expect(formatBytes(2048)).toBe('2.0 Ko');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 Mo');
  });

  it('attribue une teinte stable à une même personne', () => {
    expect(hueFromString('Alice Martin')).toBe(hueFromString('Alice Martin'));
    expect(hueFromString('Alice')).not.toBe(hueFromString('Bob'));
  });
});
