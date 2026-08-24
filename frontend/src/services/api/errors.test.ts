import { describe, expect, it } from 'vitest';

import { ApiError, NetworkError, toMessage, toReference, toToastText } from './errors';

describe('traduction des erreurs API', () => {
  it('traduit les statuts HTTP en messages humains', () => {
    expect(toMessage(new ApiError(409, '', '/v1/workflows')).title).toBe(
      'Action impossible',
    );
    expect(toMessage(new ApiError(403, '', '/v1/users')).title).toBe('Accès refusé');
    // 502 vient du reverse proxy : c'est l'API qui est muette, pas EJBCA.
    // L'ancien libellé accusait la PKI et envoyait l'exploitant sur une
    // fausse piste.
    expect(toMessage(new ApiError(502, '', '/v1/certificates')).title).toContain(
      'Service de signature injoignable',
    );
  });

  it("n'expose ni trace d'exécution ni détail technique à l'utilisateur", () => {
    const text = toToastText(new ApiError(500, 'Traceback: KeyError at line 42', '/x'));
    expect(text).not.toContain('Traceback');
    expect(text).not.toContain('KeyError');
    // Une référence courte reste affichée : elle rend un signalement exploitable.
    expect(text).toContain('réf. HTTP 500');
  });

  it('mappe tous les statuts que la pile peut réellement produire', () => {
    // Un statut non mappé retombait sur un message générique qui n'aidait
    // ni l'utilisateur ni le dépannage.
    for (const status of [400, 401, 403, 404, 405, 408, 409, 413, 415, 422,
                          429, 500, 501, 502, 503, 504]) {
      const m = toMessage(new ApiError(status, '', '/x'));
      expect(m.title, `statut ${status} non mappé`).not.toBe('Une erreur est survenue');
    }
  });

  it('fournit une référence citable pour chaque type d’erreur', () => {
    expect(toReference(new ApiError(504, '', '/x'))).toBe('HTTP 504');
    expect(toReference(new NetworkError('/x', 'timeout'))).toBe('réseau');
    expect(toReference(new TypeError('boum'))).toBe('TypeError');
  });

  it('reconnaît le cas Vault indisponible et propose une issue', () => {
    const message = toMessage(
      new ApiError(503, "Vault n'est pas disponible.", '/v1/keys/generate'),
    );
    expect(message.title).toBe('Vault non disponible');
    expect(message.hint).toContain('stockage local');
  });

  it('reconnaît une clé de signature introuvable', () => {
    const message = toMessage(
      new ApiError(404, 'Clé « abc » introuvable.', '/v1/sign/hash/sign'),
    );
    expect(message.title).toBe('Clé de signature introuvable');
  });

  it("explique l'ordre séquentiel plutôt que de renvoyer le message brut", () => {
    const message = toMessage(
      new ApiError(400, "En attente de la signature de l'ordre 1", '/v1/workflows/sign-step'),
    );
    expect(message.title).toBe('Ce n’est pas encore votre tour');
  });

  it('distingue les erreurs réessayables', () => {
    expect(new ApiError(500, '', '/x').isRetryable).toBe(true);
    expect(new ApiError(429, '', '/x').isRetryable).toBe(true);
    expect(new NetworkError('/x', 'Connexion impossible').isRetryable).toBe(true);
    // Une requête invalide le restera : réessayer est inutile.
    expect(new ApiError(400, '', '/x').isRetryable).toBe(false);
    expect(new ApiError(404, '', '/x').isRetryable).toBe(false);
  });

  it('identifie les erreurs d’authentification', () => {
    expect(new ApiError(401, '', '/x').isAuthError).toBe(true);
    expect(new ApiError(403, '', '/x').isAuthError).toBe(true);
    expect(new ApiError(500, '', '/x').isAuthError).toBe(false);
  });

  it('retombe sur un message générique pour une erreur inconnue', () => {
    expect(toMessage(new Error('boum')).title).toBe('Une erreur est survenue');
  });
});
