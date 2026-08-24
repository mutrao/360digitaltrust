# Sécurité — décisions et limites

> Ce document dit ce qui est protégé **et ce qui ne l'est pas**. Un état des
> lieux flatteur serait plus dangereux qu'utile.

---

## 1. Limite majeure : le backend n'authentifie personne

**Constat.** `signature-api` n'a aucun middleware d'authentification. Toutes ses
routes — création de workflow, signature, journal d'audit, annuaire — sont
accessibles à quiconque atteint le port, sans jeton.

**Ce que fait le frontend.** Il intègre Keycloak proprement et envoie
`Authorization: Bearer …` sur chaque appel. Le serveur ignore cet en-tête.

**Ce que cela implique.** Le RBAC de l'interface masque des boutons ; il
n'empêche personne d'appeler l'API avec `curl`. **Tant que la validation
serveur n'est pas activée, considérez l'API comme publique.**

**Mesures compensatoires obligatoires en production :**

- ne jamais exposer `signature-api` directement sur Internet ;
- placer un reverse proxy qui exige un jeton valide, ou restreindre l'accès
  réseau (VPN, filtrage IP, mTLS) ;
- surveiller le journal d'audit.

**Correctif attendu** — détaillé dans
[`BACKEND_INTEGRATION.md`](BACKEND_INTEGRATION.md) §3.1 : validation RS256 du
jeton contre le JWKS du realm, contrôle de `iss` / `aud` / `exp`, puis
dépendance `require_roles()` sur chaque route.

La page **Administration → Diagnostic** affiche cet avertissement en permanence.

---

## 2. Confidentialité des documents

Le document **ne quitte jamais le poste**. `crypto.subtle.digest` calcule
l'empreinte dans le navigateur ; seuls 32 octets (SHA-256) sont transmis.

Conséquences assumées :

- le serveur ne peut ni prévisualiser, ni archiver, ni renvoyer le document ;
- chaque signataire doit disposer du fichier par ses propres moyens ;
- une fuite de la base ne révèle aucun contenu documentaire.

`crypto.subtle` exige un **contexte sécurisé** : en HTTP sur un nom d'hôte autre
que `localhost`, la signature est impossible. Le message d'erreur le dit
explicitement, et le Diagnostic contrôle ce point.

---

## 3. Jetons

| Décision | Motif |
|---|---|
| Jamais dans `localStorage` | Un XSS lirait le jeton et le rejouerait |
| Conservés en mémoire (`useRef`) | Disparaissent à la fermeture de l'onglet |
| `sessionStorage` pour l'état PKCE seulement | Valeurs à usage unique, sans valeur rejouable |
| Renouvellement silencieux | Évite les déconnexions intempestives |
| Aucun jeton journalisé | Ni `console.log`, ni message d'erreur |

Une règle ESLint (`no-restricted-properties` sur `localStorage.setItem`) empêche
la régression, avec le message qui renvoie à ce document.

---

## 4. Flux OIDC

**Authorization Code + PKCE**, client **public**.

Un SPA ne peut protéger aucun secret : tout ce qui est dans le bundle est
lisible. Un `client_secret` y serait une fuite, pas une protection. PKCE
remplace le secret par une preuve à usage unique générée à chaque connexion.

Configuration Keycloak attendue :

```
Client authentication      Off (client public)
Standard flow              On
Direct access grants       Off
PKCE Code Challenge Method S256
Valid redirect URIs        https://signature.client.local/auth/callback
Web origins                https://signature.client.local
```

`Direct access grants` doit rester désactivé : ce flux fait transiter le mot de
passe par l'application, ce que le SSO existe précisément pour éviter.

---

## 5. Clés privées

Générées **côté serveur**, elles ne sont jamais transmises au navigateur. Le
client ne reçoit qu'un `key_id` et le CSR.

| Stockage | État | Usage |
|---|---|---|
| HashiCorp Vault | Chiffré, journalisé | **Recommandé en production** |
| Volume local | Fichiers PEM, `0600` | Développement, démonstration |

Le stockage local est un repli fonctionnel, pas une cible de production : les
clés y sont en clair sur le volume.

---

## 6. Protections navigateur

**Content Security Policy** (servie par Nginx) :

```
default-src 'self'; script-src 'self'; frame-ancestors 'none';
object-src 'none'; base-uri 'self'; form-action 'self'
```

`script-src 'self'` sans `'unsafe-inline'` ni `'unsafe-eval'` : aucun script
injecté ne s'exécute. `'unsafe-inline'` est en revanche nécessaire sur
`style-src` — Radix UI positionne ses surfaces flottantes par style inline ;
l'interdire casserait menus et dialogues sans gain réel, le vecteur d'attaque
par CSS seul étant marginal.

`connect-src` reste large pour permettre de joindre un Keycloak sur un autre
domaine. **Restreignez-le à vos domaines en production.**

Autres en-têtes : `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`
désactivant caméra, micro, géolocalisation et paiement. `server_tokens off`.

**XSS applicatif.** Aucun `dangerouslySetInnerHTML` dans le code. React échappe
tout le reste par défaut.

**Validation de la configuration runtime.** `src/lib/config.ts` valide chaque
valeur reçue : les URL sont restreintes à `http`/`https` (pas de `javascript:`),
la couleur d'accent doit correspondre à trois entiers ≤ 255 avant d'être écrite
dans une variable CSS. Une valeur invalide est ignorée, jamais appliquée.

---

## 7. Fichiers déposés

Contrôlés côté interface : taille ≤ 50 Mo, extensions `.pdf`, `.xml`, `.docx`,
fichier vide rejeté.

Ces contrôles servent l'ergonomie, pas la sécurité — le fichier n'étant jamais
transmis, il ne présente aucun risque côté serveur. Ils évitent qu'un
utilisateur bloque son navigateur sur un fichier de 2 Go.

---

## 8. Messages d'erreur

Aucune trace d'exécution, aucun code HTTP nu, aucun détail d'infrastructure
n'atteint l'utilisateur. `src/services/api/errors.ts` traduit chaque cas en
message actionnable ; le détail technique reste disponible pour la
journalisation mais n'est jamais affiché.

Un test vérifie qu'un message d'erreur ne contient ni « 500 » ni « Traceback ».

---

## 9. Persistance des données

Redis, **avec expiration** : workflows 30 jours, audit 90 jours, signataires
365 jours.

Deux conséquences à porter à la connaissance du client :

1. sans volume persistant, un redémarrage efface tout ;
2. le journal d'audit disparaît au bout de 90 jours — insuffisant pour la
   plupart des obligations légales de conservation.

Une migration vers PostgreSQL est recommandée avant toute mise en production
soumise à une exigence de conservation.

---

## 10. Vérifications avant mise en production

- [ ] Validation des jetons activée côté `signature-api`
- [ ] TLS actif (obligatoire pour Web Crypto)
- [ ] `connect-src` de la CSP restreint aux domaines réels
- [ ] Vault démarré et initialisé
- [ ] Volumes persistants pour Redis et les clés
- [ ] Mots de passe par défaut de `.env` remplacés
- [ ] `signature-api` non exposée directement sur Internet
- [ ] Client Keycloak public, `Direct access grants` désactivé
- [ ] Politique de conservation de l'audit conforme aux obligations légales
- [ ] Sauvegarde et restauration testées
