# Frontend — 360DigitalTrust

Interface de la plateforme de signature électronique. React 18 · TypeScript strict ·
Vite · Tailwind · TanStack Query · OIDC (Keycloak).

## Démarrage rapide

```bash
npm install
npm run dev            # http://localhost:5173, proxy /api → localhost:8080
```

Le backend doit tourner (`docker compose up -d signature-api`). Pour cibler une
autre adresse : `VITE_DEV_API=http://192.168.1.10:8080 npm run dev`.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production dans `dist/` |
| `npm run typecheck` | TypeScript strict, sans émission |
| `npm run lint` | ESLint, zéro avertissement toléré |
| `npm test` | Tests unitaires (Vitest) |
| `npm run test:e2e` | Parcours critiques (Playwright) |

## Ce qu'il faut comprendre avant de contribuer

**Le document ne quitte jamais le navigateur.** `src/lib/crypto.ts` calcule
l'empreinte SHA-256 localement ; seuls 32 octets partent vers l'API. Toute
fonctionnalité qui exigerait d'envoyer le fichier contredit le produit.

**Le backend n'authentifie personne.** Le jeton Keycloak est envoyé, mais pas
vérifié côté serveur. Le RBAC de `src/services/auth/rbac.ts` gouverne
l'affichage, pas l'accès. Voir [`../docs/SECURITY.md`](../docs/SECURITY.md).

**Aucune fonctionnalité factice.** Si le backend ne sait pas faire quelque chose,
l'écran le dit ou l'entrée disparaît — via `/v1/capabilities`. Ne jamais simuler.

**Une image, N clients.** Aucune URL client n'est compilée dans le bundle :
tout vient de `/config/runtime-config.json`, régénéré au démarrage du conteneur.

## Organisation

```
src/
  app/          routeur, providers, garde de route
  components/
    ui/         primitives du design system
    layout/     coquille applicative
    common/     composants métier partagés
  features/     un dossier par domaine
  hooks/        hooks de données (TanStack Query)
  lib/          configuration runtime, crypto, utilitaires
  services/
    api/        client HTTP, endpoints, traduction des erreurs
    auth/       OIDC et RBAC
  types/        types alignés sur les modèles backend
```

Règles : aucun `fetch` dans un composant, aucune valeur d'environnement en dur,
aucun `any` sans justification écrite.

## Design system

Tokens dans `src/styles/globals.css`, exposés à Tailwind via
`tailwind.config.ts`. Les couleurs passent toutes par des variables CSS — c'est
ce qui permet au branding client de s'appliquer au runtime.

Thèmes clair et sombre définis au niveau des tokens, y compris pour le mode
« système » (aucun attribut posé). Ne jamais définir une couleur uniquement dans
un bloc `@media` ou `[data-theme]`.

Inter pour l'interface, JetBrains Mono pour toute donnée cryptographique.

## Documentation

- [`FRONTEND_PLAN.md`](../docs/FRONTEND_PLAN.md) — décisions d'architecture
- [`BACKEND_INTEGRATION.md`](../docs/BACKEND_INTEGRATION.md) — cartographie de l'API
- [`AUTHENTICATION.md`](../docs/AUTHENTICATION.md) — Keycloak et Active Directory
- [`DEPLOYMENT.md`](../docs/DEPLOYMENT.md) — installation On-Premise
- [`SECURITY.md`](../docs/SECURITY.md) — décisions de sécurité
