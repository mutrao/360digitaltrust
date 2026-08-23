# Guide d'installation locale — 360DigitalTrust PKI

> Guide mis à jour après tests réels. Tous les problèmes rencontrés sont documentés.

---

## Prérequis

| Outil | Version | Vérification |
|---|---|---|
| Docker Desktop | 24.0+ | `docker --version` |
| Docker Compose | 2.20+ | `docker compose version` |
| RAM allouée à Docker | **6 Go minimum** | Docker Desktop → Settings → Resources |
| Espace disque | 10 Go | `df -h` |

> **Important Mac** : aller dans Docker Desktop → Settings → Resources → Memory et mettre **au moins 6144 Mo** avant de commencer. Sinon Vault et EJBCA seront tues par l'OOM killer.

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
Les **trois valeurs suivantes doivent être identiques** :

```env
EJBCA_DB_PASSWORD=changeme_db_2026!
POSTGRES_PASSWORD=changeme_db_2026!   # ← même valeur que EJBCA_DB_PASSWORD
POSTGRES_USER=ejbca
EJBCA_DB_USER=ejbca                   # ← même valeur que POSTGRES_USER
```

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
5. Activer **REST CA Management** → cliquer **Enable**
6. Cliquer **Save**

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

Ce script crée :
- `360DT-Root-CA` — RSA 4096, 20 ans
- `360DT-Sub-Signature-CA` — RSA 4096, 10 ans
- `360DT-Sub-TSA-CA` — RSA 4096, 10 ans
- `360DT-Sub-OCSP-CA` — RSA 2048, 5 ans

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
NAME              STATUS
pki-db            healthy
pki-hsm           running
pki-ca            healthy
crl-publisher     running
pki-cache         healthy
signature-api     healthy
pki-gateway       running
```

> **Note** : Vault n'est PAS démarré par défaut (problèmes mémoire sur Mac).
> Pour l'activer : `docker compose --profile vault up -d vault`

---

## Étape 7 — Tester la Signature API

```bash
# Health check
curl http://localhost:8080/health
# {"status":"ok","service":"signature-api","version":"1.0.0"}

# Swagger UI
open http://localhost:8080/docs
```

---

## Problèmes fréquents

### PostgreSQL : password authentication failed

```bash
# Les mots de passe EJBCA_DB_PASSWORD et POSTGRES_PASSWORD doivent être identiques dans .env
# Solution : réinitialiser les volumes
docker compose down -v
docker compose up -d pki-db pki-hsm
```

### Vault : address already in use

Vault est désactivé par défaut. Si vous l'avez activé et qu'il bloque :
```bash
docker kill pki-vault && docker rm pki-vault
```

### EJBCA REST : This service has been disabled

Faire l'étape 4 (activer l'API REST via adminweb ou CLI).

### Container tué (exit code 137)

Manque de mémoire. Aller dans Docker Desktop → Settings → Resources → Memory → augmenter à 6+ Go.

### Warning : attribute `version` is obsolete

Avertissement sans impact, ignorer. Le fichier `docker-compose.yml` ne contient plus l'attribut `version`.
