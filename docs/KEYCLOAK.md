# Keycloak et Active Directory

> L'application ne parle jamais à Active Directory. La chaîne est :
> **AD → fédération LDAP → Keycloak → OIDC → application → API.**

---

## 1. Pourquoi cette chaîne

Un SPA ne peut pas interroger LDAP : il faudrait embarquer des identifiants de
service dans du code téléchargé par le navigateur. Keycloak sert d'intermédiaire
— il détient les secrets, l'application ne reçoit qu'un jeton signé.

Bénéfice pratique : le jour où le client passe d'AD à un autre annuaire, seule
la configuration Keycloak change. L'application n'est pas touchée.

---

## 2. Créer le realm et le client

### 2.1 Realm

Console Keycloak → **Create realm** → nom (ex. `banque`).

### 2.2 Client

**Clients** → **Create client** :

| Champ | Valeur | Pourquoi |
|---|---|---|
| Client type | OpenID Connect | — |
| Client ID | `esign-frontend` | Repris dans `KEYCLOAK_CLIENT_ID` |
| Client authentication | **Off** | Un SPA ne peut protéger aucun secret |
| Standard flow | **On** | Authorization Code |
| Direct access grants | **Off** | Ce flux ferait transiter le mot de passe par l'application |
| Valid redirect URIs | `https://signature.client.local/auth/callback` | URI exacte, pas de joker |
| Valid post logout redirect URIs | `https://signature.client.local` | — |
| Web origins | `https://signature.client.local` | En-têtes CORS |

Puis **Advanced** → **PKCE Code Challenge Method** → `S256`.

> Ne jamais utiliser `*` en redirect URI : n'importe quel site pourrait
> intercepter le code d'autorisation.

### 2.3 Rôles

**Realm roles** → créer `user`, `manager`, `admin`.

| Rôle | Peut |
|---|---|
| `user` | Créer des demandes, suivre les siennes, générer des clés |
| `manager` | Idem, plus : voir toutes les demandes, annuler, gérer les signataires, consulter l'audit |
| `admin` | Idem, plus : accéder à l'administration |

Tout porteur d'un jeton valide obtient au minimum `user`.

---

## 3. Fédération Active Directory

**User federation** → **Add LDAP providers**.

| Champ | Valeur type |
|---|---|
| Vendor | `Active Directory` |
| Connection URL | `ldaps://dc01.client.local:636` |
| Bind DN | `CN=svc-keycloak,OU=Services,DC=client,DC=local` |
| Bind credentials | mot de passe du compte de service |
| Users DN | `OU=Utilisateurs,DC=client,DC=local` |
| Username LDAP attribute | `sAMAccountName` |
| UUID LDAP attribute | `objectGUID` |
| User object classes | `person, organizationalPerson, user` |
| Edit mode | `READ_ONLY` |

Recommandations :

- **LDAPS** (636), pas LDAP en clair : les identifiants transiteraient sinon
  en clair sur le réseau ;
- compte de service **en lecture seule** ;
- `Edit mode: READ_ONLY` — l'annuaire reste la source de vérité ;
- activer **Import users** et **Sync registrations** selon la volumétrie.

Tester avec **Test connection** puis **Test authentication**.

---

## 4. Groupes AD → rôles applicatifs

**User federation → esign-ldap → Mappers** → **Add mapper** → type
`group-ldap-mapper` :

| Champ | Valeur |
|---|---|
| LDAP Groups DN | `OU=Groupes,DC=client,DC=local` |
| Group Name LDAP Attribute | `cn` |
| Group Object Classes | `group` |
| Mode | `READ_ONLY` |
| User Groups Retrieve Strategy | `LOAD_GROUPS_BY_MEMBER_ATTRIBUTE` |

Puis, pour chaque groupe : **Groups** → sélectionner le groupe →
**Role mapping** → assigner le rôle de realm correspondant.

```
GG-Signature-Utilisateurs   → user
GG-Signature-Responsables   → manager
GG-Signature-Admins         → admin
```

Un utilisateur retiré du groupe AD perd le rôle à sa prochaine connexion.

---

## 5. Transmettre les rôles dans le jeton

L'application lit `realm_access.roles`, présent par défaut. Vérifier dans
**Client scopes** → `roles` → **Mappers** que `realm roles` a bien
**Add to access token** activé.

Pour afficher l'organisation dans l'interface, ajouter un mapper d'attribut
utilisateur nommé `organization` (par exemple depuis `company` ou `department`
d'AD).

---

## 6. Configurer l'application

```yaml
environment:
  KEYCLOAK_URL: https://sso.client.local
  KEYCLOAK_REALM: banque
  KEYCLOAK_CLIENT_ID: esign-frontend
```

Redémarrer le conteneur, puis vérifier dans
**Administration → Diagnostic** :

```
Configuration Keycloak   ✓  sso.client.local · realm « banque »
Découverte OIDC          ✓  Émetteur : https://sso.client.local/realms/banque
Session en cours         ✓  a.martin · rôle ADMIN
```

Le contrôle « Découverte OIDC » interroge réellement
`/.well-known/openid-configuration` : il échoue si le realm est mal nommé,
inactif, ou si CORS bloque la requête.

---

## 7. Ce que Keycloak ne protège pas encore

Le service `signature-api` **ne vérifie pas** le jeton. Configurer Keycloak
protège l'accès à l'interface, pas à l'API.

Tant que la validation serveur n'est pas activée
(voir [`BACKEND_INTEGRATION.md`](BACKEND_INTEGRATION.md) §3.1), l'API doit être
protégée au niveau réseau. C'est rappelé dans
[`SECURITY.md`](SECURITY.md) §1 et affiché en permanence dans le Diagnostic.

---

## 8. Problèmes fréquents

| Symptôme | Cause | Correctif |
|---|---|---|
| `invalid_redirect_uri` | URI non déclarée | Ajouter l'URI **exacte** dans le client |
| Boucle de redirection | Horloges désynchronisées | Synchroniser NTP sur les deux serveurs |
| « Keycloak injoignable » | CORS | Ajouter l'origine dans **Web origins** |
| Rôles absents | Mapper désactivé | Activer `realm roles` dans le scope `roles` |
| Utilisateur inconnu après ajout AD | Synchronisation | **User federation** → **Sync all users** |
| `unauthorized_client` | Client confidentiel | Passer **Client authentication** sur **Off** |
