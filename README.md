# 360DigitalTrust — PKI Microservices

> Infrastructure PKI open-source conteneurisée, conforme eIDAS.  
> **EJBCA CE** | **SoftHSM2** | **PAdES / XAdES / CAdES** | **TSA RFC 3161** | **OCSP**

## Architecture

```
                     ┌────────────────────┐
 Internet ─────────► │  Traefik Gateway  │
                     └─────┬─────────────┘
                            │
            ─────────────┼─────────────
            │              │             │
   ┌────────┴──┐   ┌─────┴────┐  ┌──────┴───┐
   │ Signature API│   │ EJBCA CE  │  │ CRL Nginx │
   │  FastAPI/Python│  │  PKI+OCSP+│  └──────────┘
   │  PAdES/XAdES/  │  │  TSA+CRL  │
   │  CAdES         │  └─────┬───┘
   └─────┬─────────┘         │
            │           ┌─────┴────┐
   ┌───────┴────┐     │  PostgreSQL │
   │   Redis Cache │     └───────────┘
   └─────────────┘
   ┌─────────────┐
   │ HashiCorp Vault│   ← Secrets / Clés privées
   └─────────────┘
```

## Démarrage rapide

```bash
cp .env.example .env
docker compose up -d
```

See `docs/INSTALLATION.md` for full setup guide.

## Documentation

| Document | Description |
|---|---|
| [Installation locale](docs/INSTALLATION.md) | Setup complet pas-à-pas |
| [Guide de test](docs/TESTING.md) | Tests unitaires, intégration, charge |
| [Déploiement cloud](docs/DEPLOYMENT_CLOUD.md) | Options gratuites pour tests à grande échelle |

## Stack technique

| Composant | Technologie | Rôle |
|---|---|---|
| PKI Engine | EJBCA CE 8.x | Root CA, Sub-CA, OCSP, TSA, CRL |
| HSM (dév) | SoftHSM2 | Simulation PKCS#11 |
| Base de données | PostgreSQL 16 | Stockage PKI + audit |
| Cache | Redis 7 | OCSP / CRL cache |
| Signature | FastAPI + pyHanko + signxml | PAdES / XAdES / CAdES |
| Secrets | HashiCorp Vault | Clés privées chiffrées |
| Gateway | Traefik v3 | TLS, routage, rate-limiting |
| Monitoring | Prometheus + Grafana | Métriques + alertes |

## Conformité

- eIDAS (EU 910/2014)
- ETSI EN 319 411 (NCP, NCP+)
- ETSI EN 319 421 (TSA)
- RFC 5280 (X.509), RFC 6960 (OCSP), RFC 3161 (TSA)
