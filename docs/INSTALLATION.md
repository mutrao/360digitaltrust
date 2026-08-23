# Guide d'installation locale — 360DigitalTrust PKI

> Guide mis à jour après tests réels. Tous les problèmes rencontrés sont documentés.

> **Mac avec peu de RAM** : Vault est désactivé par défaut pour économiser la mémoire.
> Activer uniquement si nécessaire : `docker compose --profile vault up -d vault`

---

## Prérequis

| Outil | Version | Vérification |
|---|---|---|
| Docker Desktop | 24.0+ | `docker --version` |
| Docker Compose | 2.20+ | `docker compose version` |
| RAM allouée à Docker | **6 Go minimum** | Docker Desktop → Settings → Resources |
| Espace disque | 10 Go | `df -h` |

> **Important Mac** : aller dans Docker Desktop → Settings → Resources → Memory et mettre **au moins 6144 Mo** avant de commencer. Sinon Vault et EJBCA seront tués par l'OOM killer.

---

## Étape 0 — Récupérer le projet

```bash
git clone https://github.com/mutrao/360digitaltrust.git
cd 360digitaltrust
```

> Si vous avez déjà cloné le projet et voulez repartir de zéro, consultez **[docs/RESET.md](RESET.md)** d'abord.

---

## Étape 1 — Configurer l'environnement

```bash
cp .env.example .env
```

Le fichier `.env` contient des mots de passe par défaut fonctionnels pour le développement local.  
Les **valeurs suivantes doivent être identiques** :

```env
EJBCA_DB_PASSWORD=changeme_db_2026!
POSTGRES_PASSWORD=changeme_db_2026!   # ← même valeur que EJBCA_DB_PASSWORD
POSTGRES_USER=ejbca
EJBCA_DB_USER=ejbca                   # ← même valeur que POSTGRES_USER
```

> ⚠️ Si ces valeurs diffèrent, EJBCA échoue avec "password authentication failed".

---

## Étape 2 — Démarrer la base de données et le HSM

```bash
docker compose up -d pki-db pki-hsm
```

Attendre que PostgreSQL soit prêt (~20 secondes) :

```bash
docker compose logs pki-db | grep "ready to accept"
# Attendu : database system is ready to accept connections
```

---

## Étape 3 — Démarrer EJBCA

```bash
docker compose up -d pki-ca cache
```

EJBCA prend **3 à 5 minutes** au premier démarrage (déploiement WildFly + initialisation).  
Suivre les logs :

```bash
docker compose logs -f pki-ca
```

Le démarrage est terminé quand vous voyez :

```
A fresh installation was detected and a ManagementCA was created
URL: https://<id>:443/ejbca/adminweb/
```

Vérifier le health check :

```bash
curl -sk https://localhost:8443/ejbca/publicweb/healthcheck/ejbcahealth
# Réponse attendue : ALLOK
```

---

## Étape 4 — Activer l'API REST EJBCA

L'API REST est **désactivée par défaut** dans EJBCA CE. Il faut l'activer manuellement.

### Option A — Via l'interface web (recommandé)

1. Ouvrir **https://localhost:8443/ejbca/adminweb/**
2. Accepter l'avertissement SSL du navigateur
3. Menu gauche : **System Configuration** → **Protocol Configuration**
4. Activer **REST Certificate Management** → cliquer **Enable**
5. Cliquer **Save**

> ℹ️ **REST CA Management** est disponible en édition Enterprise uniquement.
> Pour l'émission de certificats en CE, utiliser l'adminweb ou la CLI EJBCA.

### Option B — Via CLI dans le container

```bash
docker compose exec pki-ca /opt/ejbca/bin/ejbca.sh config protocols \
  --enable --protocol REST
```

### Vérification

```bash
curl -sk https://localhost:8443/ejbca/ejbca-rest-api/v1/ca | python3 -m json.tool
# Attendu : liste JSON avec ManagementCA
```

---

## Étape 5 — Initialiser la hiérarchie PKI

```bash
docker compose exec pki-ca bash /opt/ejbca/init/01-init-ca.sh
```

Ce script est **idempotent** (sûr à relancer). Il crée :
- `360DT-Root-CA` — RSA 4096, 20 ans (ancre de confiance)
- `360DT-Sub-Signature-CA` — RSA 4096, 10 ans (certificats signataires)
- `360DT-Sub-TSA-CA` — RSA 4096, 10 ans (horodatage RFC 3161)
- `360DT-Sub-OCSP-CA` — RSA 2048, 5 ans (répondeur OCSP)

Vérifier :

```bash
curl -sk https://localhost:8443/ejbca/ejbca-rest-api/v1/ca | python3 -m json.tool
# Attendu : 5 CA (ManagementCA + 4 ci-dessus)
```

---

## Étape 6 — Démarrer les services restants

```bash
docker compose up -d
```

Vérifier l'état de tous les services :

```bash
docker compose ps
```

Sortie attendue (tous `running` ou `healthy`) :

```
NAME              STATUS          PORTS
pki-db            healthy         5432/tcp
pki-hsm           running
pki-ca            healthy         0.0.0.0:8443->8443/tcp
crl-publisher     running         80/tcp
pki-cache         healthy         6379/tcp
signature-api     healthy         0.0.0.0:8080->8000/tcp
pki-frontend      running         0.0.0.0:3001->80/tcp
pki-gateway       running         0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
```

> Vault n'apparaît pas sauf si démarré avec `--profile vault`.

---

## Étape 7 — Tester la Signature API

```bash
# Health check
curl http://localhost:8080/health
# {"status":"ok","service":"signature-api","version":"2.0.0"}

# Swagger UI — documentation interactive de tous les endpoints
open http://localhost:8080/docs
```

---

## Étape 8 — Interface Web Frontend

Le frontend démarre automatiquement à l'étape 6 sur le port **3001**.

```bash
# Vérifier que le frontend est démarré
docker compose ps pki-frontend

# Accéder à l'interface
open http://localhost:3001
```

### Fonctionnalités de l'interface

| Section | Description |
|---------|-------------|
| **Tableau de bord** | Stats en temps réel (signatures, workflows, utilisateurs, clés), activité récente |
| **Signer un document** | Glisser-déposer PDF/XML/DOCX — hash SHA-256 calculé localement (Web Crypto API) |
| **Vérifier** | Recherche d'une signature par ID, détail complet de l'audit |
| **Workflows** | Création séquentiel / parallèle / mixte, suivi progression, annulation |
| **Utilisateurs** | CRUD signataires / admins / auditeurs, activation/désactivation |
| **Audit & Logs** | Historique filtrable par type et signataire, export CSV |
| **Certificats** | Visualisation chaîne PKI Root→Sub-CA |
| **Clés** | Génération RSA 2048/3072/4096 ou ECDSA P-256/P-384/P-521, copie de l'ID |

### Architecture privacy-first (hash-only signing)

Le fichier ne transite **jamais** sur le réseau. Seul le hash (32 octets) est envoyé à l'API.

```
Navigateur                              Serveur (signature-api)
──────────────────────────────────      ────────────────────────────
1. Charge le fichier localement
2. Calcule SHA-256 (Web Crypto API)
3. Envoie uniquement le hash ──────────► 4. Signe avec la clé privée (RSA/ECDSA)
                               ◄────────── 5. Retourne signature Base64 + certificat
6. Affiche / stocke la signature         6. Enregistre dans l'audit trail Redis
```

### Workflow de signature typique via l'interface

```
[Clés] → Générer RSA 2048 → Copier l'ID de clé
[Signer] → Glisser un fichier → Coller l'ID → Cliquer "Signer"
[Audit] → Vérifier que l'événement hash_signed est enregistré
[Workflows] → Créer un workflow multi-signataires avec le hash calculé
```

---

## Étape 9 — Activer Vault (optionnel)

Vault est **désactivé par défaut** pour éviter les problèmes de mémoire sur Mac.
La Signature API stocke les clés localement (`/tmp/pki-keys/`) si Vault est absent.

```bash
# Démarrer Vault uniquement si nécessaire
docker compose --profile vault up -d vault

# Initialiser les politiques Vault
docker compose exec vault sh /vault/init/init-vault.sh
```

---

## Étape 10 — Stack monitoring (optionnelle)

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

Interfaces disponibles :
- **Grafana** : http://localhost:3000 (admin / mot de passe dans `.env`)
- **Prometheus** : http://localhost:9090
- **Traefik Dashboard** : http://localhost:8888

---

## Ports exposés (résumé)

| Port | Service | Description |
|---|---|---|
| `3001` | **Frontend** | Interface web SPA (dashboard, sign, workflows, audit, users) |
| `8080` | Signature API | REST API de signature (Swagger : http://localhost:8080/docs) |
| `8443` | EJBCA | Interface admin + REST API PKI |
| `8009` | EJBCA HTTP | CRL + OCSP non-TLS |
| `8888` | Traefik | Dashboard |
| `3000` | Grafana | Monitoring (profil monitoring) |
| `9090` | Prometheus | Métriques (profil monitoring) |
| `8210` | Vault | Secrets (profil vault) |

---

## Structure des répertoires

```
360digitaltrust/
├── docker-compose.yml              # Stack principale (9 services)
├── docker-compose.monitoring.yml   # Prometheus + Grafana
├── .env.example
├── frontend/
│   ├── Dockerfile                  # Nginx Alpine
│   ├── nginx.conf                  # Proxy /api/ → signature-api:8000
│   └── index.html                  # SPA (dashboard, sign, workflows, audit, users, certs, keys)
├── signature-api/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py                 # FastAPI v2.0.0
│       ├── config.py
│       ├── routers/
│       │   ├── keys.py             # Génération RSA/ECDSA
│       │   ├── sign_hash.py        # Hash-only signing (privacy-first)
│       │   ├── workflows.py        # Workflows multi-signataires
│       │   ├── audit.py            # Audit trail + statistiques
│       │   ├── users.py            # Gestion signataires
│       │   ├── sign_pdf.py         # PAdES (pyHanko)
│       │   ├── sign_xml.py         # XAdES (signxml)
│       │   ├── sign_cms.py         # CAdES (cryptography)
│       │   ├── ocsp.py             # Vérification OCSP
│       │   └── tsa.py              # Horodatage RFC 3161
│       └── services/
│           ├── key_manager.py      # Stockage clés (Vault / fichier local)
│           ├── workflow_store.py   # Redis — workflows (TTL 30j)
│           ├── audit_store.py      # Redis — audit trail (TTL 90j)
│           ├── user_store.py       # Redis — utilisateurs (TTL 365j)
│           ├── ejbca_service.py    # Client EJBCA REST
│           └── cache_service.py    # Client Redis
├── pki/
│   ├── ejbca/conf/
│   ├── ejbca/init/
│   ├── softhsm/
│   └── postgres/
├── gateway/
│   ├── nginx/crl.conf
│   └── traefik/dynamic/
├── vault/
│   ├── policies/
│   └── init/init-vault.sh
└── monitoring/
    ├── prometheus/
    ├── alertmanager/
    └── grafana/
```

---

## Problèmes fréquents

### PostgreSQL : password authentication failed

```bash
# EJBCA_DB_PASSWORD et POSTGRES_PASSWORD doivent être identiques dans .env
docker compose down -v
docker compose up -d pki-db pki-hsm
```

### Vault : address already in use (si profil vault activé)

```bash
docker kill pki-vault && docker rm pki-vault
```

### EJBCA REST : This service has been disabled

Faire l'étape 4 (activer l'API REST via adminweb → Protocol Configuration).

### Container tué (exit code 137)

Manque de mémoire. Docker Desktop → Settings → Resources → Memory → augmenter à 6+ Go.
Vault est désactivé par défaut précisément pour ce problème.

### Warning : attribute `version` is obsolete

Avertissement sans impact, ignorer. Le `docker-compose.yml` ne contient plus l'attribut `version`.

### Frontend : ERR_CONNECTION_REFUSED sur /api/

La signature-api n'est pas encore `healthy`. Attendre quelques secondes puis recharger.

```bash
docker compose ps signature-api   # doit afficher "healthy"
```

---

## Réinitialisation complète (repartir de zéro)

```bash
# Arrêter et supprimer tous les conteneurs + volumes
docker compose --profile vault down -v --remove-orphans

# Supprimer les images buildées localement
docker rmi $(docker images | grep '360digitaltrust' | awk '{print $3}') 2>/dev/null || true

# Vérifier
docker compose ps   # doit renvoyer : no containers

# Repartir depuis l'étape 2
```
