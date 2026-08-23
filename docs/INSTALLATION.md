# Guide d'installation locale — 360DigitalTrust PKI

## Prérequis

| Outil | Version minimale | Vérification |
|---|---|---|
| Docker | 24.0+ | `docker --version` |
| Docker Compose | 2.20+ | `docker compose version` |
| RAM disponible | 6 Go minimum (8 Go recommandé) | `free -h` |
| Disk libre | 10 Go | `df -h` |
| CPU | 4 vCPU recommandés | `nproc` |

---

## Étape 1 — Cloner le projet

```bash
git clone https://github.com/mutrao/360digitaltrust.git
cd 360digitaltrust
git checkout claude/gifted-tesla-988nl3
```

---

## Étape 2 — Configurer l'environnement

```bash
cp .env.example .env
```

Éditer `.env` et **changer tous les mots de passe** :

```bash
# Générer des mots de passe sécurisés
openssl rand -base64 32   # pour EJBCA_ADMIN_PASSWORD
openssl rand -base64 32   # pour POSTGRES_PASSWORD
openssl rand -base64 32   # pour CA_TOKEN_PIN
openssl rand -base64 32   # pour REDIS_PASSWORD
```

---

## Étape 3 — Démarrer l'infrastructure de base

### 3.1 Démarrage de la PKI (ordre important)

```bash
# Étape 1 : Base de données + HSM
docker compose up -d pki-db pki-hsm

# Attendre que PostgreSQL soit prêt (~15s)
docker compose logs -f pki-db | grep "ready to accept"
```

```bash
# Étape 2 : Démarrer EJBCA
# ⚠️ Premier démarrage : 3-5 minutes (déploiement WildFly)
docker compose up -d pki-ca

# Surveiller le démarrage
docker compose logs -f pki-ca
# Attendre le message : "EJBCA started successfully"
```

```bash
# Étape 3 : Démarrer tous les services
docker compose up -d
```

### 3.2 Vérifier que tout est actif

```bash
docker compose ps
```

Sortie attendue (tous `healthy` ou `running`) :
```
NAME              STATUS          PORTS
pki-db            healthy         5432/tcp
pki-hsm           running
pki-ca            healthy         0.0.0.0:8443->8443/tcp
crl-publisher     running         80/tcp
pki-cache         healthy         6379/tcp
vault             healthy         8200/tcp
signature-api     healthy         0.0.0.0:8080->8000/tcp
pki-gateway       running         0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
```

---

## Étape 4 — Initialiser la hiérarchie PKI

```bash
# Exécuter le script d'initialisation des CA
docker compose exec pki-ca bash /opt/ejbca/init/01-init-ca.sh
```

Ce script crée :
- `360DT-Root-CA` — RSA 4096, 20 ans (ancre de confiance)
- `360DT-Sub-Signature-CA` — RSA 4096, 10 ans (certificats signataires)
- `360DT-Sub-TSA-CA` — RSA 4096, 10 ans (horodatage)
- `360DT-Sub-OCSP-CA` — RSA 2048, 5 ans (répondeur OCSP)

### Vérifier les CA créées

```bash
curl -sk https://localhost:8443/ejbca/ejbca-rest-api/v1/ca | python3 -m json.tool
```

---

## Étape 5 — Initialiser Vault

```bash
# Exécuter le script d'init Vault
docker compose exec vault sh /vault/init/init-vault.sh
```

---

## Étape 6 — Stack monitoring (optionnelle)

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

Interfaces disponibles :
- **Grafana** : http://localhost:3000 (admin / mot de passe dans `.env`)
- **Prometheus** : http://localhost:9090
- **Traefik Dashboard** : http://localhost:8888

---

## Étape 7 — Interface Web Frontend

Le frontend démarre automatiquement avec `docker compose up -d`.

```bash
# Vérifier que le frontend est démarré
docker compose ps pki-frontend

# Accéder à l'interface
open http://localhost:3001
```

### Fonctionnalités de l'interface

| Section | Description |
|---------|-------------|
| **Tableau de bord** | Stats en temps réel, activité récente, actions rapides |
| **Signer un document** | Hash calculé localement (Web Crypto API) — le fichier ne quitte jamais le navigateur |
| **Vérifier** | Recherche d'une signature par ID |
| **Workflows** | Création et suivi des workflows multi-signataires (séquentiel/parallèle/mixte) |
| **Utilisateurs** | Gestion des signataires, admins, auditeurs |
| **Audit & Logs** | Historique complet, filtres, export CSV |
| **Certificats** | Visualisation de la chaîne PKI Root→Sub-CA |
| **Clés** | Génération RSA/ECDSA, stockage local ou Vault |

### Architecture privacy-first (hash-only signing)

```
Navigateur                          Serveur
────────────────────────────────    ──────────────────────────
1. Charge le fichier PDF            
2. Calcule SHA-256 (Web Crypto)     
3. Envoie uniquement le hash ──────► 4. Signe le hash (clé privée)
                              ◄────── 5. Retourne signature + certificat
6. Stocke la signature localement   6. Enregistre dans l'audit trail
```

Le fichier ne transite jamais sur le réseau — seuls 32 octets (le hash) sont envoyés.

---

## Ports exposés (résumé)

| Port | Service | Description |
|---|---|---|
| `3001` | Frontend | Interface web SPA |
| `8080` | Signature API | REST API de signature |
| `8443` | EJBCA | Interface admin + REST API PKI |
| `8009` | EJBCA HTTP | CRL + OCSP non-TLS |
| `8888` | Traefik | Dashboard |
| `3000` | Grafana | Monitoring |
| `9090` | Prometheus | Métriques |
| `8200` | Vault | Interface secrets (profil vault) |

---

## Structure des répertoires

```
360digitaltrust/
├── docker-compose.yml          # Stack principale
├── docker-compose.monitoring.yml
├── .env.example
├── pki/
│   ├── ejbca/conf/              # Configuration EJBCA
│   ├── ejbca/init/              # Scripts + profils de certificats
│   ├── softhsm/                 # Image SoftHSM2
│   └── postgres/                # Init SQL
├── frontend/
│   ├── Dockerfile                # Nginx Alpine
│   ├── nginx.conf                # Proxy vers signature-api
│   └── index.html                # SPA complète (dashboard, sign, workflows, audit, users)
├── signature-api/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py               # Entrée FastAPI v2.0.0
│       ├── config.py
│       ├── routers/              # keys, sign_hash, workflows, audit, users, certificates, ocsp, tsa
│       └── services/             # ejbca, cache, vault, key_manager, workflow_store, audit_store, user_store
├── gateway/
│   ├── nginx/crl.conf
│   └── traefik/dynamic/
├── vault/
│   ├── config/vault.hcl
│   ├── policies/
│   └── init/init-vault.sh
└── monitoring/
    ├── prometheus/
    ├── alertmanager/
    └── grafana/
```
