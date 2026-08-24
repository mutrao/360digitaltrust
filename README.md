# 360DigitalTrust — PKI Microservices

> Infrastructure PKI open-source conteneurisée, conforme eIDAS.  
> **EJBCA CE** | **SoftHSM2** | **PAdES / XAdES / CAdES** | **TSA RFC 3161** | **OCSP**

## Architecture

```
                        ┌──────────────────┐
   Navigateur ─────────►│ Traefik Gateway  │
        │               └────────┬─────────┘
        │ SHA-256 local          │
        ▼               ┌────────┴─────────┐
   ┌─────────┐          │                  │
   │ Frontend│◄─────────┘         ┌────────▼────────┐
   │  Nginx  │  /api/ ───────────►│  Signature API  │
   │  SPA    │                    │  FastAPI/Python │
   └─────────┘                    │  hash · PAdES   │
        │                         │  XAdES · CAdES  │
        │ OIDC                    └────┬───────┬────┘
        ▼                              │       │
   ┌──────────┐  LDAPS  ┌────────┐     │       │
   │ Keycloak │────────►│   AD   │     │       │
   └──────────┘         └────────┘     │       │
                          ┌────────────▼──┐  ┌─▼──────────┐
                          │   EJBCA CE    │  │   Redis    │
                          │ PKI·OCSP·TSA  │  │   cache    │
                          └───┬───────┬───┘  └────────────┘
                              │       │
                     ┌────────▼─┐  ┌──▼────────┐  ┌───────────┐
                     │PostgreSQL│  │ SoftHSM2  │  │   Vault   │
                     └──────────┘  └───────────┘  │(optionnel)│
                                                  └───────────┘
```

## Démarrage rapide

```bash
cp .env.example .env
docker compose up -d
```

| Service | Adresse |
|---|---|
| **Interface web** | http://localhost:3001 |
| API de signature (Swagger) | http://localhost:8080/docs |
| Administration EJBCA | https://localhost:8443/ejbca/adminweb/ |

Guide complet : [`docs/INSTALLATION.md`](docs/INSTALLATION.md).

> **Confidentialité par conception.** Les documents ne quittent jamais le poste
> du signataire : seule leur empreinte SHA-256 (32 octets) est transmise, calculée
> localement par le navigateur.

## Documentation

### Mise en route

| Document | Contenu |
|---|---|
| [Installation locale](docs/INSTALLATION.md) | Mise en place pas-à-pas |
| [Déploiement On-Premise](docs/DEPLOYMENT.md) | Installation chez un client, reverse proxy, mise à jour |
| [Configuration](docs/CONFIGURATION.md) | Variables runtime, une image pour N clients |
| [Guide de test](docs/TESTING.md) | Tests unitaires, intégration, charge |

### Architecture et sécurité

| Document | Contenu |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Vue d'ensemble et décisions techniques |
| [Spécification API](docs/API_SPECIFICATION.md) | Surface du service de signature, et spécification des clés éphémères |
| [Intégration backend](docs/BACKEND_INTEGRATION.md) | Cartographie de l'API, fonctionnalités manquantes |
| [Sécurité](docs/SECURITY.md) | Décisions, limites connues, liste de contrôle avant production |
| [Plan frontend](docs/FRONTEND_PLAN.md) | Conception de l'interface |

### Authentification

| Document | Contenu |
|---|---|
| [Authentification](docs/AUTHENTICATION.md) | Vue d'ensemble OIDC |
| [Keycloak](docs/KEYCLOAK.md) | Configuration du realm, du client et des rôles |
| [Active Directory](docs/ACTIVE_DIRECTORY.md) | Fédération LDAP via Keycloak |

## Stack technique

| Composant | Technologie | Rôle |
|---|---|---|
| Interface web | React 18 · TypeScript · Vite · Tailwind | SPA, calcul local des empreintes |
| Authentification | Keycloak · OIDC Code + PKCE | SSO, fédération Active Directory |
| PKI Engine | EJBCA CE 8.x | Root CA, Sub-CA, OCSP, TSA, CRL |
| HSM (dév) | SoftHSM2 | Simulation PKCS#11 |
| Base de données | PostgreSQL 16 | Stockage PKI + audit |
| Cache | Redis 7 | OCSP / CRL cache |
| Signature | FastAPI + pyHanko + signxml | PAdES / XAdES / CAdES |
| Secrets | HashiCorp Vault | Clés privées chiffrées |
| Gateway | Traefik v3 · Nginx | TLS, routage, proxy applicatif |
| Monitoring | Prometheus + Grafana | Métriques + alertes |

## Conformité

- eIDAS (EU 910/2014)
- ETSI EN 319 411 (NCP, NCP+)
- ETSI EN 319 421 (TSA)
- RFC 5280 (X.509), RFC 6960 (OCSP), RFC 3161 (TSA)


## État du projet

| Domaine | État |
|---|---|
| Signature hash-only, workflows, audit, annuaire | Opérationnel |
| Clés RSA/ECDSA, certificats EJBCA, OCSP, horodatage | Opérationnel |
| Interface web complète, Keycloak, RBAC, branding runtime | Opérationnel |
| Validation des jetons côté API | **Non implémentée** — voir [SECURITY.md](docs/SECURITY.md) §1 |
| Stockage de documents, e-mails, modèles | Non implémentés par conception ou à faire — voir [BACKEND_INTEGRATION.md](docs/BACKEND_INTEGRATION.md) §3 |

Avant toute mise en production, dérouler la liste de contrôle de
[`docs/SECURITY.md`](docs/SECURITY.md) §10.
