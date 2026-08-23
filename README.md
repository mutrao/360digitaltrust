# 360DigitalTrust — PKI Microservices

Infrastructure PKI open-source conteneurisée, conforme eIDAS.  
**EJBCA CE** | **SoftHSM2** | **PAdES / XAdES / CAdES** | **TSA RFC 3161** | **OCSP**

## Architecture

```
 Internet ───► Traefik Gateway
                    │
         ─────────┼──────────
         │              │
  Signature API     EJBCA CE 8.x
  FastAPI/Python    PKI+OCSP+TSA+CRL
  PAdES/XAdES/          │
  CAdES             PostgreSQL 16
         │
     Redis Cache
```

## Démarrage rapide

```bash
git clone https://github.com/mutrao/360digitaltrust.git
cd 360digitaltrust
cp .env.example .env
# Éditer .env si nécessaire
docker compose up -d pki-db pki-hsm
sleep 20
docker compose up -d pki-ca cache
# Attendre 3-5 min (EJBCA se déploie)
docker compose up -d
```

Suivre le guide complet : **[docs/INSTALLATION.md](docs/INSTALLATION.md)**

## Documentation

| Document | Description |
|---|---|
| [Installation](docs/INSTALLATION.md) | Guide complet pas-à-pas |
| [Tests](docs/TESTING.md) | Scénarios de test avec commandes |
| [Reset complet](docs/RESET.md) | Tout remettre à zéro |
| [Déploiement cloud](docs/DEPLOYMENT_CLOUD.md) | Options gratuites |

## Stack

| Composant | Technologie | Rôle |
|---|---|---|
| PKI Engine | EJBCA CE 8.x | CA, OCSP, TSA, CRL |
| HSM (dév) | SoftHSM2 | Clés CA PKCS#11 |
| Base de données | PostgreSQL 16 | Stockage PKI + audit |
| Cache | Redis 7 | OCSP / CRL |
| Signature | FastAPI + pyHanko + signxml | PAdES / XAdES / CAdES |
| Gateway | Traefik v3 | TLS, routage |
| Secrets (optionnel) | HashiCorp Vault | Clés privées chiffrées |

## Ports locaux

| Port | Service |
|---|---|
| 8080 | Signature API + Swagger UI |
| 8443 | EJBCA admin + REST API |
| 8009 | EJBCA HTTP (CRL/OCSP) |
| 8888 | Traefik dashboard |
