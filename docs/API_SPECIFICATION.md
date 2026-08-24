# Spécification — API de signature

> **Périmètre.** Les sections 1 à 4 décrivent le service tel qu'il existe
> aujourd'hui (`signature-api` v2.0.0), vérifié dans le code. La section 5
> spécifie la **signature à clés éphémères**, qui n'est **pas implémentée** :
> elle est à construire.

---

## 1. Principe directeur

Le service est un **moteur de signature cryptographique adossé à une PKI**,
pas une plateforme de gestion documentaire. Un choix structure tout le reste :

> **Le document ne transite jamais.** Seule son empreinte SHA-256 (32 octets)
> est transmise. Le serveur ne voit, ne stocke et ne renvoie aucun fichier.

Conséquences assumées :

| Bénéfice | Contrepartie |
|---|---|
| Aucune fuite documentaire possible : il n'y a rien à exfiltrer | Pas d'aperçu partagé entre signataires |
| Conformité RGPD triviale sur le contenu | Pas de placement de champs dans le PDF |
| Volumétrie serveur négligeable | Chaque signataire doit détenir le fichier |
| Le poste client peut rester hors ligne pour la lecture | Pas d'archivage du document signé |

---

## 2. Architecture

```
Navigateur ──SHA-256 local──► signature-api ──► EJBCA CE ──► SoftHSM2
                              (FastAPI)          (PKI)       (PKCS#11)
                                   │
                                   ├──► Redis   (workflows, audit, annuaire)
                                   └──► Vault   (clés privées, optionnel)
```

| Composant | Rôle | Obligatoire |
|---|---|---|
| `signature-api` | Signature, workflows, audit | oui |
| EJBCA CE 8.x | Root CA, 3 Sub-CA, OCSP, TSA, CRL | oui |
| SoftHSM2 | Protection des clés de CA (PKCS#11) | oui |
| PostgreSQL 16 | Données EJBCA | oui |
| Redis 7 | État métier, avec expiration | oui |
| HashiCorp Vault | Clés privées des signataires | non |

**Hiérarchie PKI** — `360DT-Root-CA` (RSA 4096, 20 ans) et trois Sub-CA :
signature (RSA 4096, 10 ans), horodatage (RSA 4096, 10 ans), OCSP (RSA 2048,
5 ans).

**Persistance.** Redis uniquement, **avec expiration** : workflows 30 jours,
audit 90 jours, annuaire 365 jours. Aucune base relationnelle pour le métier.
Sans volume persistant, un redémarrage efface tout. À reprendre avant
production soumise à une obligation de conservation.

---

## 3. Surface fonctionnelle

Détail exhaustif des payloads : [`BACKEND_INTEGRATION.md`](BACKEND_INTEGRATION.md).

### 3.1 Signature

| Format | Route | Norme | Dépendance |
|---|---|---|---|
| Empreinte seule | `POST /v1/sign/hash/sign` | — | aucune |
| PAdES (PDF) | `POST /v1/sign/pdf/sign` | ETSI EN 319 142 | **Vault requis** |
| XAdES (XML) | `POST /v1/sign/xml/sign` | ETSI EN 319 132 | **Vault requis** |
| CAdES (CMS) | `POST /v1/sign/cms/sign` | ETSI EN 319 122 | **Vault requis** |

> Les trois derniers appellent `KeyManager.load_key_from_vault()` et échouent
> sans Vault. Seule la signature d'empreinte fonctionne avec le stockage local.
> Écart à corriger : ils devraient passer par `load_key()`, qui gère les deux.

Algorithmes : RSA (PKCS#1 v1.5) et ECDSA. Empreintes SHA-256 / 384 / 512.

### 3.2 Clés et certificats

| Route | Rôle |
|---|---|
| `POST /v1/keys/generate` | Paire RSA 2048/3072/4096 ou EC P-256/384/521, renvoie un CSR PKCS#10 |
| `GET /v1/keys/storage-backends` | Backends de stockage disponibles |
| `POST /v1/certificates/issue` | Émission X.509 via EJBCA |
| `POST /v1/certificates/revoke` | Révocation, 9 motifs RFC 5280 |
| `GET /v1/certificates/cas` | Liste des CA |

La clé privée n'est **jamais** transmise au client : il ne reçoit qu'un
`key_id` opaque et le CSR.

### 3.3 Workflows multi-signataires

`POST /v1/workflows/create` · `POST /v1/workflows/sign-step` ·
`GET /v1/workflows/{id}` · `DELETE /v1/workflows/{id}`

Modes `sequential` (ordre imposé par le serveur, vérifié), `parallel`, `mixed`.
Statuts réellement produits : `pending`, `completed`, `cancelled` — il n'y en a
pas d'autres.

### 3.4 Horodatage et validation

| Route | Norme |
|---|---|
| `POST /v1/tsa/timestamp` | RFC 3161 |
| `POST /v1/ocsp/check` | RFC 6960, réponses mises en cache Redis |

### 3.5 Audit et annuaire

`GET /v1/audit/logs` · `/logs/{signature_id}` · `/stats` — événements émis :
`sign_hash`, `workflow_created`, `workflow_cancelled`.

`/v1/users/` gère un **annuaire de signataires**, pas des comptes : ni mot de
passe, ni droit, aucun rôle dans l'authentification.

### 3.6 Absent du service

Authentification · stockage de documents · e-mails · modèles · placement de
champs PDF · pagination serveur · **signature à clés éphémères**.

---

## 4. Modèle de clés actuel : clés persistantes

```
Génération ──► Stockage (Vault ou volume) ──► Réutilisation à chaque signature
                        │
                        └── durée de vie : indéfinie
```

Le `key_id` désigne une clé conservée côté serveur, réutilisée pour toutes les
signatures ultérieures de son porteur.

**Ce que ce modèle impose :**

- une garde de clés dans la durée — chiffrement, sauvegarde, rotation ;
- une gestion de révocation : clé compromise ⇒ révoquer le certificat,
  publier la CRL, régénérer ;
- une responsabilité juridique sur la détention des clés des signataires ;
- côté ergonomie, l'utilisateur doit conserver et ressaisir son `key_id` — le
  service n'expose aucun inventaire.

Ce modèle convient à un signataire technique récurrent (serveur, cachet
d'entreprise). Il convient mal à la signature ponctuelle par une personne.

---

## 5. Spécification — signature à clés éphémères

> **Statut : à implémenter.** Rien de ce qui suit n'existe dans le code.

### 5.1 Le problème que cela résout

La signature d'un contrat par un client externe ne justifie pas de lui créer,
conserver et gérer une clé permanente. Détenir durablement les clés privées de
tiers est une charge de sécurité et une exposition juridique, pour un usage
souvent unique.

Le modèle éphémère — celui de DocuSign, Yousign et de la signature à distance
au sens eIDAS — retourne le problème : **la clé n'existe que le temps d'une
signature.**

### 5.2 Principe

```
1. Authentifier le signataire          ← préalable indispensable (§5.6)
2. Générer une paire de clés            en mémoire, jamais écrite
3. Émettre un certificat court           EJBCA, validité 5–15 minutes
4. Signer l'empreinte
5. Horodater (RFC 3161)                  ← rend la preuve durable (§5.5)
6. Collecter la preuve de validité       OCSP au moment de la signature
7. Détruire la clé privée                effacement mémoire, immédiat
8. Consigner le dossier de preuve
```

Ce qui subsiste après l'opération : la signature, le certificat, le jeton
d'horodatage, la réponse OCSP. **Aucune clé privée.**

### 5.3 Endpoint proposé

L'opération doit être **atomique** : une clé éphémère qui survivrait à un
échec partiel perdrait tout l'intérêt du modèle.

```http
POST /v1/sign/ephemeral
```

```jsonc
{
  "document_hash_b64": "…",              // 32 octets pour SHA-256
  "hash_algorithm": "sha256",
  "document_name": "contrat.pdf",
  "document_mime": "application/pdf",

  "signer": {                            // identité portée par le certificat
    "common_name": "Alice Martin",
    "email": "alice.martin@exemple.fr",
    "organization": "Groupe Meridian",
    "country": "FR"
  },

  "algorithm": "EC",                     // EC recommandé : génération immédiate
  "curve": "P-256",
  "certificate_validity_minutes": 10,
  "timestamp": true                      // fortement recommandé (§5.5)
}
```

```jsonc
// 201 Created
{
  "signature_id": "…",
  "signature_b64": "…",
  "signed_at": "2026-08-24T09:14:32Z",

  "certificate_pem": "-----BEGIN CERTIFICATE-----…",
  "certificate_serial": "0x1a2b3c…",
  "certificate_chain_pem": ["…sub-ca…", "…root…"],
  "certificate_not_after": "2026-08-24T09:24:32Z",

  "timestamp_token_b64": "…",            // RFC 3161
  "ocsp_response_b64": "…",              // statut au moment de la signature

  "key_lifetime_ms": 412,                // durée d'existence de la clé
  "key_destroyed": true
}
```

**Codes d'erreur**

| Code | Cause |
|---|---|
| 400 | Empreinte de taille incorrecte |
| 401 | Signataire non authentifié — **rédhibitoire** (§5.6) |
| 422 | Identité incomplète |
| 502 | EJBCA ou TSA injoignable |
| 503 | Émission de certificat indisponible |

Toute erreur postérieure à la génération **doit** déclencher la destruction de
la clé avant de répondre.

### 5.4 Destruction de la clé

La clé ne doit à aucun moment atteindre un support persistant : ni Vault, ni
volume, ni journal, ni cache, ni trace d'exception.

```python
# Aucun appel à store_key() sur ce chemin. La clé vit dans une variable locale.
try:
    private_key = KeyManager.generate_ec_key("P-256")
    ...
finally:
    del private_key
```

**Limite à documenter honnêtement.** En Python, l'effacement mémoire n'est pas
garanti : le ramasse-miettes libère l'objet sans le surécrire, et rien
n'empêche une copie résiduelle. La destruction est donc *logique*, non
*physique*. La garantie forte exige une génération dans le HSM, avec une clé
qui ne quitte jamais le module — c'est la voie à retenir en production
qualifiée.

### 5.5 L'horodatage n'est pas optionnel

C'est le point que ce modèle rend critique.

Un certificat valide 10 minutes est **expiré** quelques minutes après la
signature. Sans preuve de la date, une vérification ultérieure conclut :
« signature effectuée avec un certificat expiré » — donc invalide.

L'horodatage RFC 3161 atteste que la signature existait **pendant** la période
de validité du certificat. Il transforme une preuve périssable en preuve
durable.

```
        signature          cert expire              vérification
            │                    │                       │
   ─────────┼────────────────────┼───────────────────────┼──────►
            │                    │                       │
       horodatage ────── prouve que la signature précède l'expiration
```

**Conséquence de conception : sur ce chemin, `timestamp: false` doit être
refusé, ou produire un avertissement explicite dans la réponse et l'audit.**
Une signature éphémère non horodatée est une preuve à durée de vie de dix
minutes.

Même raisonnement pour OCSP : la réponse doit être capturée **au moment de la
signature** et conservée. Après expiration, le répondeur ne dira plus rien
d'utile. Ces trois éléments réunis — certificat, horodatage, OCSP — forment un
dossier vérifiable hors ligne (profil **LTV**, ETSI EN 319 102).

### 5.6 Dépendance bloquante : l'authentification

Un certificat éphémère **affirme une identité**. Aujourd'hui, `signer_id` est
une chaîne libre qui vaut `"anonymous"` par défaut, et aucune route n'est
protégée.

> En l'état, ce modèle produirait des certificats attestant d'identités que
> personne n'a vérifiées — une machine à fabriquer de fausses preuves.

**La validation du jeton Keycloak côté API est un prérequis, pas une option.**
L'identité inscrite dans le certificat doit provenir du jeton vérifié, jamais
du corps de la requête. Voir [`BACKEND_INTEGRATION.md`](BACKEND_INTEGRATION.md)
§3.1 et [`SECURITY.md`](SECURITY.md) §1.

### 5.7 Autres prérequis

| Prérequis | État |
|---|---|
| Validation OIDC côté API | **absent — bloquant** |
| Émission de certificat via EJBCA REST | à activer et éprouver (limites en édition CE) |
| Profil de certificat « éphémère » (validité courte, `nonRepudiation`) | à créer dans EJBCA |
| TSA opérationnelle | route présente, à valider de bout en bout |
| Politique de certification (CP/CPS) couvrant l'usage éphémère | à rédiger |

Un profil dédié est nécessaire : les profils actuels visent des certificats de
plusieurs mois. Prévoir `keyUsage = digitalSignature, nonRepudiation`, une
validité en minutes, et une émission automatisée sans intervention humaine.

### 5.8 Comparaison

| | Clé persistante | Clé éphémère |
|---|---|---|
| Durée de vie de la clé | indéfinie | quelques centaines de ms |
| Garde des clés | à assurer | **aucune** |
| Révocation | processus à tenir | sans objet (expiration) |
| Validité du certificat | mois / années | minutes |
| Horodatage | recommandé | **indispensable** |
| Surface d'attaque au repos | clés stockées | néant |
| Authentification | souhaitable | **indispensable** |
| Ergonomie signataire | doit gérer un `key_id` | transparent |
| Usage adapté | cachet serveur, signataire récurrent | signature ponctuelle par une personne |

Les deux modèles coexistent sans conflit : le service peut exposer les deux
chemins et laisser le contexte décider.

### 5.9 Impact sur l'existant

| Élément | Modification |
|---|---|
| `POST /v1/sign/ephemeral` | à créer |
| `KeyManager` | ajouter un chemin **sans persistance** ; interdire tout stockage sur ce flux |
| `/v1/workflows/sign-step` | option `ephemeral: true` — chaque étape signe avec sa propre clé |
| Audit | consigner certificat, numéro de série, horodatage, OCSP, durée de vie de la clé |
| `/v1/capabilities` | drapeau `ephemeral_signing` |
| Vérification | vérifier via l'horodatage, pas via la validité courante du certificat |
| Frontend | supprimer la saisie de `key_id` et du certificat sur ce parcours |

Le gain d'ergonomie est notable côté interface : les écrans de signature
n'auraient plus à réclamer un identifiant de clé et un certificat PEM, qui sont
aujourd'hui le principal point de friction.

---

## 6. Feuille de route suggérée

| Ordre | Chantier | Pourquoi d'abord |
|---|---|---|
| 1 | Validation du jeton Keycloak côté API | Prérequis du modèle éphémère, et correction d'une faille ouverte |
| 2 | Émission EJBCA éprouvée + profil éphémère | Sans cela, pas de certificat à la volée |
| 3 | TSA validée de bout en bout | Sans horodatage, la preuve ne survit pas |
| 4 | `POST /v1/sign/ephemeral` | Le cœur |
| 5 | Dossier de preuve LTV et vérification hors ligne | Rend la signature opposable dans la durée |
| 6 | Génération de clé dans le HSM | Destruction réellement garantie |
| 7 | Migration Redis → PostgreSQL | Conservation légale de l'audit |

Les étapes 1 à 3 sont des prérequis, pas des options : construire l'étape 4
avant elles produirait une fonctionnalité qui *paraît* marcher sans rien
prouver.
