# Intégration Backend — cartographie complète

> Document de référence pour le frontend. Toute route listée ici a été lue
> dans le code source (`signature-api/app/routers/`), pas déduite.
>
> Backend : FastAPI 0.111 · Python 3.12 · `signature-api` v2.0.0
> Base URL frontend : `/api` (proxy Nginx → `http://signature-api:8000/`)

---

## 1. Résumé exécutif

Le backend est un **microservice PKI de signature cryptographique**, pas une
plateforme de gestion documentaire. Cette distinction structure tout le frontend.

**Ce qu'il fait réellement :**

- génère des paires de clés RSA / ECDSA et des CSR PKCS#10 ;
- émet et révoque des certificats X.509 via EJBCA ;
- signe des **empreintes** (hash) de documents — le fichier ne transite jamais ;
- signe des PDF (PAdES), XML (XAdES), CMS (CAdES) ;
- orchestre des workflows de signature multi-signataires ;
- horodate (RFC 3161) et vérifie les certificats (OCSP) ;
- conserve un journal d'audit et un annuaire de signataires.

**Ce qu'il ne fait pas :**

- aucune authentification, aucune notion de session ou d'identité vérifiée ;
- aucun stockage de document ;
- aucun envoi d'e-mail ;
- aucun modèle (template) de document ;
- aucun placement de champs de signature dans un PDF.

**Persistance :** Redis uniquement, avec TTL. Aucune base relationnelle pour
les données métier. Les workflows expirent après 30 jours, l'audit après
90 jours, les utilisateurs après 365 jours.

---

## 2. Endpoints disponibles

### 2.1 Santé et diagnostic

| Méthode | Route | Réponse | Écran |
|---|---|---|---|
| `GET` | `/health` | `{status, service, version}` | Diagnostic |
| `GET` | `/v1/health` | idem | Diagnostic, badge de connexion |
| `GET` | `/v1/capabilities` | `{version, features{…}, storage{…}}` | Amorçage applicatif |
| `GET` | `/metrics` | Format Prometheus | — |

`/v1/capabilities` est le contrat qui pilote l'affichage : le frontend
n'affiche une fonctionnalité que si son drapeau est `true`.

### 2.2 Clés — `/v1/keys`

| Méthode | Route | Payload | Réponse |
|---|---|---|---|
| `POST` | `/v1/keys/generate` | `{algorithm, key_size?, curve?, common_name*, organization?, country?, email?, store_in_vault}` | `{key_id, csr_pem, algorithm, storage}` |
| `GET` | `/v1/keys/storage-backends` | — | `{local{available,label}, vault{available,label}}` |

- `algorithm` : `"RSA"` \| `"EC"`
- `key_size` : `2048` \| `3072` \| `4096` (RSA uniquement)
- `curve` : `"P-256"` \| `"P-384"` \| `"P-521"` (EC uniquement)
- `common_name` est **obligatoire** — une omission renvoie `422`.
- `store_in_vault: true` renvoie `503` si Vault n'est pas démarré.

> La clé privée n'est jamais retournée. Seul le `key_id` permet de la réutiliser.

### 2.3 Certificats — `/v1/certificates`

| Méthode | Route | Payload | Réponse |
|---|---|---|---|
| `POST` | `/v1/certificates/issue` | `{key_id, csr_pem, cert_type, subject_dn, username}` | `{status, certificate}` |
| `POST` | `/v1/certificates/revoke` | `{issuer_dn, serial_hex, reason}` | `{status, detail}` |
| `GET` | `/v1/certificates/status/{issuer_dn}/{serial_hex}` | — | Statut EJBCA |
| `GET` | `/v1/certificates/cas` | — | Liste des CA |

`cert_type` : `signature` \| `tsa` \| `ocsp` \| `tls`.
Toute erreur EJBCA remonte en `502`.

### 2.4 Signature hash-only — `/v1/sign/hash`

L'endpoint central du produit.

```
POST /v1/sign/hash/sign
{
  "key_id":            "uuid",
  "certificate_pem":   "-----BEGIN CERTIFICATE-----…",
  "document_hash_b64": "base64(32 octets pour sha256)",
  "hash_algorithm":    "sha256" | "sha384" | "sha512",
  "document_name":     "contrat.pdf",
  "document_mime":     "application/pdf",
  "signer_id":         "uuid-utilisateur"
}
→ 200 {signature_id, signature_b64, signed_at, hash_algorithm,
       document_hash_b64, certificate_subject}
```

Codes d'erreur : `400` hash de taille incorrecte · `404` `key_id` introuvable ·
`500` erreur cryptographique.

Le hash est calculé **dans le navigateur** via `crypto.subtle.digest`.

### 2.5 Signature de documents

| Méthode | Route | Notes |
|---|---|---|
| `POST` | `/v1/sign/pdf/sign` | PDF en base64 dans le corps JSON |
| `POST` | `/v1/sign/pdf/sign/upload` | `multipart/form-data` |
| `POST` | `/v1/sign/xml/sign` | XAdES |
| `POST` | `/v1/sign/cms/sign` | CAdES |

> ⚠️ Ces trois routeurs appellent `KeyManager.load_key_from_vault()` et
> **exigent donc Vault**. Seul `/v1/sign/hash` fonctionne avec le stockage local.
> Le frontend privilégie la signature hash-only et signale cette contrainte.

### 2.6 Workflows — `/v1/workflows`

| Méthode | Route | Payload / Query | Réponse |
|---|---|---|---|
| `POST` | `/v1/workflows/create` | `{title, document_name, document_hash_b64, hash_algorithm, signers[], mode, expires_at?, message?, created_by}` | `{workflow_id, status, created_at}` |
| `POST` | `/v1/workflows/sign-step` | `{workflow_id, signer_id, key_id, certificate_pem}` | `{workflow_id, workflow_status, signature_id, signed_at}` |
| `GET` | `/v1/workflows/` | `?status=&limit=` | `{workflows[], total}` |
| `GET` | `/v1/workflows/{id}` | — | Objet workflow complet |
| `DELETE` | `/v1/workflows/{id}` | `?cancelled_by=` | `{status:"cancelled"}` |

`mode` : `sequential` \| `parallel` \| `mixed`.
`signers[]` : `{user_id, name, email, order, required}`.

**Statuts réellement produits par le backend** — le frontend ne doit pas en
inventer d'autres : `pending`, `completed`, `cancelled`.

En mode séquentiel, signer hors ordre renvoie `400` avec le rang attendu.

### 2.7 Audit — `/v1/audit`

| Méthode | Route | Query | Réponse |
|---|---|---|---|
| `GET` | `/v1/audit/logs` | `?limit=&event_type=&signer_id=` | `{logs[], total}` |
| `GET` | `/v1/audit/logs/{signature_id}` | — | Entrée unique ou `404` |
| `GET` | `/v1/audit/stats` | — | `{total_signatures, total_workflows, total_events, by_event{}, by_algorithm{}}` |

Types d'événements émis : `sign_hash`, `workflow_created`, `workflow_cancelled`.

> Le filtrage est fait **en mémoire** après lecture de toute la liste.
> Acceptable jusqu'à ~10 000 événements, à revoir au-delà.

### 2.8 Utilisateurs — `/v1/users`

| Méthode | Route | Payload | Réponse |
|---|---|---|---|
| `POST` | `/v1/users/` | `{name, email, role, organization}` | Objet utilisateur |
| `GET` | `/v1/users/` | `?role=` | `{users[], total}` |
| `GET` | `/v1/users/{id}` | — | Objet ou `404` |
| `PUT` | `/v1/users/{id}/certificate` | `?key_id=&certificate_pem=` (**query**, pas body) | `{status, user_id}` |
| `DELETE` | `/v1/users/{id}` | — | `{status:"deactivated"}` |

`role` : `signer` \| `admin` \| `auditor`. `status` : `active` \| `inactive`.

> Ces « utilisateurs » sont un **annuaire de signataires**, pas des comptes.
> Ils ne portent ni mot de passe ni permission ; ils ne servent pas à
> l'authentification.

### 2.9 OCSP et horodatage

| Méthode | Route | Payload |
|---|---|---|
| `POST` | `/v1/ocsp/check` | `{certificate_pem, issuer_pem}` |
| `POST` | `/v1/tsa/timestamp` | `{data_b64, hash_algorithm, request_cert}` |

---

## 3. Fonctionnalités manquantes

Chaque manque est traité côté frontend par une abstraction isolée
(`src/services/api/`) et un état d'interface explicite — jamais par une
simulation silencieuse.

### 3.1 Authentification — bloquant

**État :** aucun. Pas de middleware, pas de vérification de jeton, pas
d'identité. Chaque route est publique.

**Nécessaire :**

```python
# signature-api/app/middleware/auth.py
# Validation OIDC du Bearer token émis par Keycloak
GET  {KEYCLOAK_URL}/realms/{realm}/protocol/openid-connect/certs  # JWKS
# Vérifier : signature RS256, iss, aud, exp, azp
# Injecter dans request.state : sub, preferred_username, email, realm_access.roles
```

Puis protéger les routes via une dépendance `Depends(require_roles(...))`.

**Traitement frontend :** Keycloak est intégré et le jeton est envoyé en
`Authorization: Bearer`. Le backend l'ignore aujourd'hui. Le RBAC frontend
masque l'interface mais **ne protège rien** — la page Diagnostic l'affiche
explicitement comme un avertissement de sécurité.

### 3.2 Stockage de documents — bloquant pour un usage type DocuSign

**État :** aucun. Par conception (hash-only), le document ne monte jamais.

**Conséquence directe :** impossible de proposer un aperçu PDF partagé, un
placement de champs de signature, ou un téléchargement du document signé —
le serveur n'a jamais vu le fichier.

**Nécessaire si l'on veut ce parcours :**

```
POST   /v1/documents            multipart → {document_id, hash, size, pages}
GET    /v1/documents/{id}       → flux PDF
GET    /v1/documents/{id}/meta  → métadonnées
DELETE /v1/documents/{id}
```

Avec un backend de stockage chiffré (S3/MinIO ou volume chiffré) et une
politique de rétention.

**Traitement frontend :** le document reste **local au navigateur**
(`File` + `URL.createObjectURL`). Le parcours de signature fonctionne
entièrement, mais le fichier n'est pas partageable entre signataires — chaque
signataire doit disposer du fichier de son côté. C'est indiqué dans l'interface.

### 3.3 Notifications e-mail

**État :** aucun. `signers[].email` est stocké mais jamais utilisé.

**Nécessaire :** `POST /v1/notifications/invite`, configuration SMTP,
file d'attente, et un modèle d'e-mail avec lien signé à usage unique.

**Traitement frontend :** l'écran de workflow génère un **lien d'invitation
copiable** à transmettre manuellement. Aucun bouton « Envoyer par e-mail »
n'est affiché tant que la capacité est `false`.

### 3.4 Modèles de documents

**État :** aucun. **Nécessaire :** CRUD `/v1/templates`.
**Traitement frontend :** entrée de navigation absente tant que
`capabilities.features.templates === false`.

### 3.5 Placement de champs dans le PDF

**État :** aucun. `pyHanko` place une signature invisible en champ `Sig1` fixe.

**Nécessaire :** persistance des coordonnées `{page, x, y, w, h, type, signer_id}`
et prise en charge par le signataire PDF.

**Traitement frontend :** non implémenté. L'étape correspondante du wizard
est retirée plutôt que présentée en factice.

### 3.6 Pagination et recherche serveur

**État :** `limit` seulement, filtrage en mémoire, pas d'`offset`, pas de
recherche plein texte, pas de total réel.

**Nécessaire :** `?offset=&q=&sort=&order=` et un `total` indépendant de `limit`.

**Traitement frontend :** pagination et recherche côté client sur la fenêtre
chargée. Un avertissement s'affiche lorsque le nombre d'éléments atteint la
limite demandée.

### 3.7 Révocation d'une signature / annulation partielle

**État :** un workflow s'annule en bloc ; une signature émise ne se révoque pas.
La révocation existe au niveau du **certificat** (`/v1/certificates/revoke`).

---

## 4. Correctifs backend appliqués pendant la découverte

Trois défauts rendaient l'API inutilisable pour un frontend. Ils sont corrigés
dans le commit `e89de3a`.

| Défaut | Impact | Correctif |
|---|---|---|
| `sign_hash`, `workflows`, `audit`, `users` jamais enregistrés dans `main.py` | `404` sur toutes les routes métier | Routeurs ajoutés |
| `KeyManager.load_key()` appelé par `sign_hash` mais inexistant | `AttributeError` → `500` à chaque signature | Méthode implémentée, recherche locale puis Vault |
| Clé générée jamais persistée si `store_in_vault=false` | Clé perdue immédiatement, signature impossible | Stockage local `/app/keys` (volume, `0600`) |

Ajouts : `GET /v1/capabilities`, `GET /v1/health`,
`GET /v1/keys/storage-backends`, méthodes CORS complètes, `404`/`400`
explicites sur `sign_hash`.

---

## 5. Correspondance écran ↔ endpoint

| Écran | Endpoints |
|---|---|
| Amorçage | `GET /v1/capabilities` |
| Tableau de bord | `GET /v1/audit/stats`, `GET /v1/workflows/`, `GET /v1/audit/logs?limit=8` |
| Demandes de signature (liste) | `GET /v1/workflows/` |
| Détail d'une demande | `GET /v1/workflows/{id}`, `DELETE /v1/workflows/{id}` |
| Nouvelle demande | `crypto.subtle.digest` puis `POST /v1/workflows/create` |
| Signer une étape | `POST /v1/workflows/sign-step` |
| Signature directe | `POST /v1/sign/hash/sign` |
| Vérification | `GET /v1/audit/logs/{signature_id}` |
| Signataires | `GET`/`POST`/`DELETE /v1/users/`, `PUT /v1/users/{id}/certificate` |
| Journal d'audit | `GET /v1/audit/logs` |
| Clés et certificats | `GET /v1/keys/storage-backends`, `POST /v1/keys/generate`, `POST /v1/certificates/issue`, `GET /v1/certificates/cas` |
| Diagnostic | `GET /v1/health`, `GET /v1/capabilities`, découverte OIDC Keycloak |
