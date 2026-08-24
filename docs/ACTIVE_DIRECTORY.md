# Active Directory

L'application **ne se connecte jamais directement à Active Directory**.

```
Active Directory ──► fédération LDAP ──► Keycloak ──► OIDC ──► Application
```

La procédure complète — connexion LDAPS, mappers de groupes, correspondance
groupes AD → rôles applicatifs — est décrite dans
[`KEYCLOAK.md`](KEYCLOAK.md) §3 et §4.

## Résumé

| Étape | Où | Référence |
|---|---|---|
| Connexion LDAPS au contrôleur de domaine | Keycloak → User federation | [`KEYCLOAK.md`](KEYCLOAK.md) §3 |
| Import des groupes | Mapper `group-ldap-mapper` | [`KEYCLOAK.md`](KEYCLOAK.md) §4 |
| Groupes AD → rôles de realm | Groups → Role mapping | [`KEYCLOAK.md`](KEYCLOAK.md) §4 |
| Rôles dans le jeton | Client scopes → roles | [`KEYCLOAK.md`](KEYCLOAK.md) §5 |
| Vérification | Administration → Diagnostic | [`KEYCLOAK.md`](KEYCLOAK.md) §6 |

## Points de vigilance

- **LDAPS obligatoire** (port 636) : en LDAP simple, les identifiants
  transitent en clair.
- **Compte de service en lecture seule**, avec `Edit mode: READ_ONLY` :
  l'annuaire reste la source de vérité.
- Un utilisateur retiré d'un groupe AD perd le rôle correspondant à sa
  prochaine connexion, pas immédiatement.
