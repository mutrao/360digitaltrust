# Authentification

L'application utilise **OpenID Connect** avec Keycloak comme fournisseur
d'identité, en **Authorization Code + PKCE** (client public, sans secret).

## Documents de référence

| Sujet | Document |
|---|---|
| Configuration Keycloak, fédération Active Directory, rôles | [`KEYCLOAK.md`](KEYCLOAK.md) |
| Décisions de sécurité et limites connues | [`SECURITY.md`](SECURITY.md) |
| Variables de configuration | [`DEPLOYMENT.md`](DEPLOYMENT.md) §3 |

## Fonctionnement

```
Utilisateur ──► Application ──► Keycloak ──► Active Directory
                     ▲               │
                     └── jeton OIDC ─┘
```

1. Sans session, l'application affiche un écran de connexion sobre.
2. « Se connecter » redirige vers Keycloak avec un défi PKCE.
3. Keycloak authentifie contre Active Directory.
4. Le retour sur `/auth/callback` échange le code contre un jeton.
5. Le jeton reste **en mémoire** ; il est renouvelé silencieusement.
6. Les rôles de realm déterminent ce que l'interface affiche.

## Mode bootstrap

Si `KEYCLOAK_URL`, `KEYCLOAK_REALM` ou `KEYCLOAK_CLIENT_ID` sont absents,
l'application démarre **sans authentification**, avec un bandeau
d'avertissement permanent. Ce mode existe pour la première installation, quand
Keycloak n'est pas encore prêt.

Il n'y a **aucun compte administrateur local codé en dur** : ce serait un
identifiant permanent connu de tous les déploiements. La protection initiale
relève du réseau (accès restreint pendant l'installation), pas d'un mot de passe
embarqué.

Dès que Keycloak est configuré et le conteneur redémarré, le mode bootstrap
disparaît de lui-même.

## Limite importante

Le backend ne valide pas encore le jeton : les restrictions visibles dans
l'interface sont ergonomiques, pas sécuritaires. Voir
[`SECURITY.md`](SECURITY.md) §1.
