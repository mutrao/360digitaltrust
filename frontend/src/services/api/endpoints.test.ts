/**
 * Régression : le tableau de bord plantait avec
 * « undefined is not an object (evaluating 'data?.logs.length') »
 * lorsque le backend renvoyait un objet sans le tableau attendu.
 *
 * Les composants doivent pouvoir se fier à la forme des listes : c'est la
 * couche API qui la garantit, pas chaque point d'affichage.
 */
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

import { auditApi, usersApi, workflowsApi } from './endpoints';
import { ApiError } from './errors';
import { loadRuntimeConfig } from '@/lib/config';

function mockJson(payload: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

function mockRaw(body: string, contentType: string, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(body, { status, headers: { 'content-type': contentType } }),
    ),
  );
}

beforeAll(async () => {
  // Le client HTTP lit getConfig(), qui exige un chargement préalable.
  // Le fichier de configuration est absent en test : les valeurs par défaut
  // (apiBaseUrl « /api ») s'appliquent, ce qui convient ici.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
  await loadRuntimeConfig();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('normalisation des réponses de liste', () => {
  it('renvoie un tableau vide quand le champ attendu est absent', async () => {
    mockJson({ total: 0 });
    const res = await auditApi.logs();
    expect(Array.isArray(res.logs)).toBe(true);
    expect(res.logs).toHaveLength(0);
  });

  it('renvoie un tableau vide quand le champ n’est pas un tableau', async () => {
    mockJson({ logs: null, total: 3 });
    const res = await auditApi.logs();
    expect(res.logs).toEqual([]);
  });

  it('survit à une réponse vide', async () => {
    mockJson({});
    const wf = await workflowsApi.list();
    expect(wf.workflows).toEqual([]);
    expect(wf.total).toBe(0);
  });

  it('préserve les données valides', async () => {
    mockJson({
      logs: [{ event: 'sign_hash', timestamp: '2026-01-01T00:00:00Z' }],
      total: 1,
    });
    const res = await auditApi.logs();
    expect(res.logs).toHaveLength(1);
    expect(res.logs[0]?.event).toBe('sign_hash');
    expect(res.total).toBe(1);
  });

  it('déduit le total du tableau quand il est absent', async () => {
    mockJson({ users: [{ id: 'a' }, { id: 'b' }] });
    const res = await usersApi.list();
    expect(res.total).toBe(2);
  });
});

describe('réponses non conformes', () => {
  it('signale une réponse HTML au lieu de la faire passer pour des données', async () => {
    // Cas réel : un reverse proxy mal configuré renvoie sa page d'accueil.
    mockRaw('<!doctype html><html><body>Bienvenue</body></html>', 'text/html');
    await expect(auditApi.logs()).rejects.toBeInstanceOf(ApiError);
  });

  it('signale un corps JSON tronqué', async () => {
    mockRaw('{"logs": [', 'application/json');
    await expect(auditApi.logs()).rejects.toBeInstanceOf(ApiError);
  });
});
