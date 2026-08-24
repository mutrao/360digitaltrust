/**
 * Parcours critiques.
 *
 * Ces tests tournent sans backend : l'API est simulée au niveau réseau.
 * Ils vérifient que l'interface se comporte correctement, y compris quand
 * le backend est absent ou renvoie une erreur — c'est précisément là que les
 * régressions font le plus de dégâts en clientèle.
 */
import { expect, test, type Page } from '@playwright/test';

const CAPABILITIES = {
  version: '2.0.0',
  features: {
    hash_signing: true,
    pdf_signing: true,
    xml_signing: true,
    cms_signing: true,
    workflows: true,
    audit_trail: true,
    users: true,
    key_generation: true,
    certificate_issuance: true,
    ocsp: true,
    timestamping: true,
    document_storage: false,
    email_notifications: false,
    templates: false,
    pdf_field_placement: false,
    authentication: false,
  },
  storage: { vault_available: false, local_keys: true },
};

async function mockApi(page: Page, overrides: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    '/api/v1/capabilities': CAPABILITIES,
    '/api/v1/health': { status: 'ok', service: 'signature-api', version: '2.0.0' },
    '/api/v1/audit/stats': {
      total_signatures: 12,
      total_workflows: 4,
      total_events: 21,
      by_event: {},
      by_algorithm: {},
    },
    '/api/v1/audit/logs': { logs: [], total: 0 },
    '/api/v1/workflows/': { workflows: [], total: 0 },
    '/api/v1/users/': { users: [], total: 0 },
    ...overrides,
  };

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const match = Object.keys(routes).find((key) => path.startsWith(key.replace(/\/$/, '')));
    if (match) {
      await route.fulfill({ json: routes[match] as object });
      return;
    }
    await route.fulfill({ status: 404, json: { detail: 'Not found' } });
  });
}

test.describe('Tableau de bord', () => {
  test('affiche les indicateurs et le principe de confidentialité', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Signatures apposées')).toBeVisible();
    await expect(page.getByText(/ne quittent pas ce poste/i)).toBeVisible();
  });

  test('propose de créer une demande quand rien n’est en attente', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    await expect(page.getByText('Rien en attente')).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test('masque les entrées dont la capacité backend est absente', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(nav.getByRole('link', { name: /Demandes de signature/ })).toBeVisible();
    // Les modèles ne sont pas supportés par le backend : l'entrée ne doit pas exister.
    await expect(nav.getByRole('link', { name: /Modèles/ })).toHaveCount(0);
  });

  test('permet de réduire la navigation latérale', async ({ page, isMobile }) => {
    test.skip(isMobile, 'La navigation est en tiroir sur mobile.');
    await mockApi(page);
    await page.goto('/');

    await page.getByRole('button', { name: 'Réduire' }).click();
    await expect(page.getByRole('button', { name: 'Déplier la navigation' })).toBeVisible();
  });
});

test.describe('Résilience', () => {
  test('affiche un message actionnable quand le backend est injoignable', async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort('failed'));
    await page.goto('/');

    await expect(page.getByText(/Service injoignable|Réessayer/).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('n’expose jamais de code HTTP brut à l’utilisateur', async ({ page }) => {
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 500, json: { detail: 'Traceback: KeyError line 42' } }),
    );
    await page.goto('/');
    await page.waitForTimeout(1500);

    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toContain('Traceback');
    expect(body).not.toContain('KeyError');
  });
});

test.describe('Création d’une demande', () => {
  test('bloque la progression tant que le document et le titre manquent', async ({ page }) => {
    await mockApi(page);
    await page.goto('/demandes/nouvelle');

    await expect(page.getByRole('button', { name: /Continuer/ })).toBeDisabled();
    await expect(page.getByText(/Le document reste sur votre poste/)).toBeVisible();
  });
});

test.describe('Vérification', () => {
  test('invite à saisir un identifiant, puis signale l’absence de résultat', async ({ page }) => {
    await mockApi(page);
    await page.goto('/verifier');

    await expect(page.getByText('Aucune signature à vérifier')).toBeVisible();

    await page.getByLabel('Identifiant de signature').fill('inconnu-1234');
    await page.getByRole('button', { name: 'Vérifier' }).click();

    await expect(page.getByText('Signature introuvable')).toBeVisible();
  });
});

test.describe('Accessibilité', () => {
  test('expose un lien d’évitement vers le contenu', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeFocused();
  });
});
