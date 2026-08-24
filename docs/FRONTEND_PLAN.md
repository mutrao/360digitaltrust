# Plan Frontend — 360DigitalTrust

## 1. Ce que la découverte a établi

Le backend est un **microservice PKI de signature**, conçu autour d'un principe
fort : *le document ne quitte jamais le poste du signataire*. Seule son
empreinte SHA-256 est transmise.

Ce principe est un atout commercial majeur face à DocuSign — et une contrainte
d'architecture qui interdit certains parcours. Le frontend est donc conçu
**autour** de ce principe, pas en dépit de lui.

| Domaine | Disponible | Commentaire |
|---|---|---|
| Signature hash-only | Oui | Cœur du produit |
| Workflows multi-signataires | Oui | Séquentiel / parallèle / mixte |
| Journal d'audit | Oui | Redis, 90 jours |
| Annuaire de signataires | Oui | Sans authentification |
| Clés et certificats | Oui | RSA/ECDSA, EJBCA, Vault ou local |
| OCSP / horodatage RFC 3161 | Oui | — |
| Authentification | **Non** | Aucun contrôle backend |
| Stockage de documents | **Non** | Par conception |
| E-mails | **Non** | — |
| Modèles | **Non** | — |
| Placement de champs PDF | **Non** | — |

Détail exhaustif : [`BACKEND_INTEGRATION.md`](BACKEND_INTEGRATION.md).

## 2. Zones d'incertitude assumées

1. **Le RBAC frontend ne sécurise rien.** Sans validation de jeton côté
   backend, masquer un bouton relève de l'ergonomie, pas de la sécurité. Le
   frontend intègre Keycloak proprement et envoie le `Bearer`, mais la page
   Diagnostic affiche un avertissement tant que le backend ne valide pas.
2. **Persistance Redis à TTL.** Un redémarrage sans volume, ou l'expiration
   d'un TTL, fait disparaître workflows et audit. À signaler au client
   On-Premise ; migration PostgreSQL recommandée avant production.
3. **PAdES/XAdES/CAdES exigent Vault.** Ces trois routeurs ne lisent que
   Vault. Le parcours principal reste hash-only, disponible sans Vault.
4. **Pas de pagination serveur.** Recherche et tri côté client sur la fenêtre
   chargée, avec avertissement à la limite.

## 3. Décisions d'architecture

| Sujet | Décision | Motif |
|---|---|---|
| Build | Vite + React 18 + TypeScript strict | Standard, rapide, sans configuration inutile |
| Données serveur | TanStack Query | Cache, invalidation, états de chargement homogènes |
| Formulaires | React Hook Form + Zod | Validation typée partagée avec les types API |
| Styles | Tailwind + tokens CSS | Branding runtime par variables CSS |
| Primitives | Radix UI | Accessibilité clavier et ARIA sans dette |
| Authentification | `oidc-client-ts` | Code + PKCE, pas d'adaptateur propriétaire |
| Configuration | `/config/runtime-config.json` | Une image Docker, N clients |
| i18n | Catalogue `fr` / `en` maison | Deux locales ne justifient pas i18next |

**Configuration runtime.** Le bundle ne contient aucune URL client. Le fichier
est lu avant le montage de React ; l'entrypoint Docker le régénère depuis les
variables d'environnement à chaque démarrage.

**Sécurité.** Code + PKCE, jamais de `client_secret`. Jetons en mémoire — pas
de `localStorage` — avec renouvellement silencieux. CSP stricte servie par
Nginx. Aucun `dangerouslySetInnerHTML`.

## 4. Navigation

```
Tableau de bord
Demandes de signature      liste, détail, création
Signature rapide           hash-only direct
Vérification               par identifiant de signature
Signataires                annuaire
Clés & certificats
Journal d'audit
Administration             admin uniquement
  Organisation · Branding · Authentification · Signataires
  Sécurité · Diagnostic · À propos
Paramètres
```

Les entrées dont la capacité backend est `false` ne sont pas rendues.

## 5. Identité visuelle

Sobriété institutionnelle. La confiance vient de la précision, pas de la
décoration.

- **Couleurs** — encre `#0B1F33`, ardoise `#5A6B7F`, bleu institutionnel
  `#1B5FA8` (accent unique), fond `#F7F9FC`, bordure `#E4E9F0`.
  Sémantique distincte de l'accent : succès `#15803D`, attention `#B45309`,
  danger `#B91C1C`.
- **Typographie** — Inter pour l'interface, JetBrains Mono pour toute donnée
  cryptographique (empreintes, identifiants, DN). Une empreinte doit *ressembler*
  à une empreinte.
- **Densité** — barre latérale 248 px repliable, contenu max 1200 px, rayon 6 px,
  bordures 1 px, ombres réservées aux surfaces flottantes.
- **Mouvement** — transitions de 120 ms sur couleur et opacité uniquement.
  `prefers-reduced-motion` respecté.

Thèmes clair et sombre définis au niveau des tokens.

## 6. Ordre de réalisation

1. Socle : Vite, TypeScript strict, tokens, configuration runtime
2. Design system : Button, Input, Select, Card, Table, Badge, Dialog, Toast, Skeleton
3. Layout : barre latérale, barre supérieure, garde de route
4. Authentification : OIDC PKCE, rôles, session, mode dégradé sans Keycloak
5. Couche API : client typé, erreurs traduites, hooks par domaine
6. Écrans : Tableau de bord → Demandes → Création → Signature → Audit → Clés → Administration
7. Livraison : Docker, Nginx, entrypoint, tests, documentation
