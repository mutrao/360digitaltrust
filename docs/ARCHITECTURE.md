# Architecture

## Vue d'ensemble

```
┌─────────────┐   OIDC    ┌──────────┐  LDAPS  ┌────────────────┐
│ Navigateur  │──────────►│ Keycloak │────────►│ Active Directory│
│             │           └──────────┘         └────────────────┘
│  SPA React  │
│  SHA-256    │  /api/    ┌──────────────┐
│  local      │──────────►│ signature-api│──► EJBCA ──► SoftHSM2
└─────────────┘           │   FastAPI    │──► Redis
       ▲                  └──────────────┘──► Vault (optionnel)
       │ HTML/JS/CSS
┌─────────────┐
│   Nginx     │  sert la SPA + proxy /api + config runtime
└─────────────┘
```

## Le principe qui structure tout

**Le document ne quitte jamais le navigateur.** Son empreinte SHA-256 est
calculée localement par `crypto.subtle`, et seuls 32 octets sont transmis.

Ce choix a des conséquences directes sur l'architecture frontend :

- pas d'aperçu PDF partagé entre signataires — le serveur n'a pas le fichier ;
- pas de placement de champs de signature ;
- l'écran de vérification compare l'empreinte d'un fichier local à celle qui a
  été signée, plutôt que d'afficher un document stocké.

## Couches

```
features/     écrans, un dossier par domaine
    │ consomme
hooks/        TanStack Query — cache, invalidation, états
    │ appelle
services/api/ client HTTP typé, traduction des erreurs
    │
signature-api
```

Aucun composant n'appelle `fetch` directement. Un seul point de passage garantit
que l'authentification, les délais et les erreurs sont traités partout de la
même façon.

## Décisions

| Sujet | Choix | Motif |
|---|---|---|
| Données serveur | TanStack Query | Cache et invalidation sans état global maison |
| Configuration | Fichier runtime | Une image, N clients |
| Authentification | `oidc-client-ts` | Standard OIDC, sans adaptateur propriétaire |
| Jetons | En mémoire | Un XSS ne peut pas les exfiltrer |
| Styles | Tailwind + variables CSS | Branding applicable au runtime |
| Primitives | Radix UI | Accessibilité clavier et ARIA sans dette |
| i18n | Catalogue maison | Deux locales ne justifient pas i18next |

## Adaptation aux capacités du backend

`GET /v1/capabilities` déclare ce que le backend sait réellement faire. Le
frontend s'en sert pour masquer les entrées de navigation correspondantes.

Une fonctionnalité absente n'est jamais simulée : elle disparaît, ou l'écran
explique ce qui manque et pourquoi. Voir
[`BACKEND_INTEGRATION.md`](BACKEND_INTEGRATION.md) §3.
