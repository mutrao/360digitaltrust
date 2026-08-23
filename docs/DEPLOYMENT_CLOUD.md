# Déploiement cloud gratuit — 360DigitalTrust PKI

> Cette page répond à la question : **peut-on déployer cette solution en ligne gratuitement pour un test à grande échelle ?**

---

## Réponse directe

**Oui, c'est possible avec des contraintes à connaître.**  
La solution complète (EJBCA + PostgreSQL + Redis + Signature API + Frontend) nécessite **~3-4 Go de RAM et 4 vCPU**. Les offres "fully free" sont limitées, mais il existe des stratégies viables.

Le **Frontend** (Nginx + SPA) est très léger (<50 Mo RAM) et peut être hébergé gratuitement sur n'importe quelle plateforme, voire sur un CDN statique.

---

## Option 1 — Oracle Cloud Free Tier (⭐ Recommandé)

**Pourquoi ?** Oracle offre des VM permanentes gratuits (pas d'expiration).

### Ressources disponibles gratuitement

| Ressource | Limite gratuite |
|---|---|
| VM ARM (Ampere A1) | **4 vCPU + 24 Go RAM** permanents |
| Stockage block | 200 Go |
| Transfert sortant | 10 To/mois |
| IP publique | 4 IP fixes |

Ces ressources suffisent largement pour la stack complète.

### Déploiement

```bash
# 1. Créer un compte Oracle Cloud Free Tier
#    https://www.oracle.com/cloud/free/

# 2. Créer une instance ARM (Ubuntu 22.04)
#    Shape : VM.Standard.A1.Flex — 4 OCPU, 24 Go RAM

# 3. Configurer le groupe de sécurité
#    Ouvrir les ports : 80, 443, 8080, 8443

# 4. Installer Docker
ssh ubuntu@<IP_ORACLE>
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu

# 5. Cloner + déployer
git clone https://github.com/mutrao/360digitaltrust.git
cd 360digitaltrust
git checkout claude/gifted-tesla-988nl3
cp .env.example .env
# Éditer .env avec votre IP publique en DOMAIN
nano .env

docker compose up -d
```

---

## Option 2 — Fly.io (Free allowance)

**Pourquoi ?** Fly.io offre ~2 340 heures/mois gratuites, support Docker natif.

### Limite

- **RAM** : 256 Mo par machine (insuffisant pour EJBCA seul : 1 Go minimum)
- **Stratégie** : Déployer uniquement la **Signature API** sur Fly.io,
  EJBCA sur Oracle Free Tier ou localement.

```bash
# Installer flyctl
curl -L https://fly.io/install.sh | sh
fly auth login

# Créer l'app Signature API
cd signature-api
fly launch --name 360dt-signature-api --dockerfile Dockerfile \
  --region cdg --no-deploy

# Configurer les secrets
fly secrets set SECRET_KEY="<secret>"
fly secrets set EJBCA_REST_URL="https://<votre-ejbca-oracle>:8443/ejbca/ejbca-rest-api/v1"
fly secrets set REDIS_URL="redis://:<pwd>@<redis-host>:6379/0"
fly secrets set VAULT_ADDR="http://<vault-host>:8200"
fly secrets set VAULT_TOKEN="<token>"

# Déployer
fly deploy

# Scaler (test de charge)
fly scale count 3   # 3 instances
```

---

## Option 3 — Railway.app (Free tier)

**Pourquoi ?** Simple, interface graphique, support Docker + PostgreSQL natif.

### Limite

- **$5 de crédit offerts** à l'inscription (pas besoin de CB)
- RAM : 512 Mo – 1 Go par service
- Suffisant pour : Signature API + Redis + PostgreSQL

```bash
# Installer Railway CLI
npm install -g @railway/cli
railway login

# Créer le projet
railway init

# Ajouter PostgreSQL et Redis depuis le marketplace Railway
# (interface web : railway.app/dashboard)

# Déployer la Signature API
railway up --service signature-api
```

---

## Option 4 — Render.com (Free tier)

**Pourquoi ?** Déploiement depuis GitHub, intégration continue automatique.

### Limite

- Services gratuits **s'endorment** après 15 min d'inactivité (pas idéal pour PKI)
- RAM : 512 Mo
- Recommandé pour : **Signature API** uniquement

```yaml
# render.yaml
services:
  - type: web
    name: 360dt-signature-api
    env: docker
    dockerfilePath: ./signature-api/Dockerfile
    dockerContext: ./signature-api
    plan: free
    envVars:
      - key: ENV
        value: production
      - key: EJBCA_REST_URL
        sync: false   # à renseigner dans le dashboard
```

---

## Architecture recommandée pour tests à grande échelle (zéro coût)

```
                        Internet
                           |
              ┌────────────────────────┐
              │  GitHub Pages / Netlify │
              │  Frontend SPA (Nginx)   │  <- statique, CDN mondial, gratuit
              │  (dashboard, sign, wf)  │
              └───────────┬────────────┘
                          |
              ┌───────────┴────────────┐
              │  Fly.io (gratuit)       │
              │  Signature API x3       │  <- scale horizontal
              │  (hash sign / workflows)│
              └───────────┬────────────┘
                          |
              ┌───────────┴────────────┐
              │  Oracle Cloud Free Tier │
              │  (4 vCPU / 24 Go RAM)   │
              │  EJBCA + PostgreSQL      │
              │  Redis + Vault           │
              └────────────────────────┘
```

**Coût total : 0 €**

### Déployer le Frontend sur GitHub Pages (gratuit, sans serveur)

Le frontend est une SPA statique — il peut être hébergé sur GitHub Pages en changeant l'URL de l'API :

```bash
# Dans frontend/index.html, modifier la constante API :
# const API = 'https://votre-signature-api.fly.dev';   # pointer vers Fly.io
# au lieu de : const API = '/api';

# Activer GitHub Pages sur le repo :
# Settings → Pages → Source: branche main → dossier /frontend
```

---

## Configuration CORS pour le déploiement cloud

Quand Frontend et Signature API sont sur des domaines différents, activer CORS dans la Signature API :

```bash
# Dans .env (sur Oracle Cloud)
FRONTEND_ORIGINS=https://mutrao.github.io,https://votre-frontend.netlify.app

# La Signature API lit CORS_ORIGINS depuis l'env et configure FastAPI automatiquement
# (déjà configuré avec allow_origins=["*"] pour le dev — restreindre en production)
```

---

## Test de charge à grande échelle

Une fois déployé, tester avec **k6 Cloud** (gratuit jusqu'à 50 VU) :

```bash
# Installer k6
brew install k6

# Test 100 utilisateurs simultanés pendant 5 minutes
k6 run --vus 100 --duration 5m - <<'EOF'
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = 'https://360dt-signature-api.fly.dev';

export default function () {
  // Health check
  let r = http.get(`${BASE_URL}/health`);
  check(r, { 'status 200': (r) => r.status === 200 });

  // Signature CAdES (opération légère)
  const payload = JSON.stringify({
    data_b64: btoa('Document test ' + Date.now()),
    key_id: __ENV.TEST_KEY_ID,
    certificate_pem: __ENV.TEST_CERT_PEM,
    detached: true,
  });
  r = http.post(`${BASE_URL}/v1/sign/cms/sign`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(r, { 'sign ok': (r) => r.status === 200 });
}
EOF
```

---

## Limites des offres gratuites pour une PKI

| Contrainte | Impact | Mitigation |
|---|---|---|
| Pas de HSM physique | Clés CA dans SoftHSM2 (moins sécurisé) | Acceptable pour les tests |
| IP dynamique possible | URLs CRL / OCSP instables | Utiliser un domaine DNS gratuit (FreeDNS) |
| Pas de SLA garanti | Disponibilité non garantie | OK pour les tests, pas pour la production |
| RAM limitée sur Fly.io | EJBCA ne peut pas s'y déployer seul | Architecture hybride (voir ci-dessus) |
| Certificats SSL auto-signés | Browsers bloquent | Let's Encrypt via Traefik (gratuit) |
| CORS requis | Frontend sur CDN ≠ domaine API | Configurer CORS_ORIGINS dans .env |
| Hash-only signing | Clé privée reste côté serveur | Sécurité renforcée — document jamais en transit |

---

## Passage en production

Pour une production réelle (marché africain ou européen) :

| Elément | Recommandation |
|---|---|
| Infrastructure | OVHcloud (Europe/Afrique) ou AWS af-south-1 |
| HSM | Thales Luna Network 7 ou Utimaco (FIPS 140-2 L3) |
| Redondance | Kubernetes + EJBCA actif/passif + PostgreSQL streaming replication |
| Certification | Audit ETSI EN 319 411 pour être listé comme TSP qualifié |
| Région Afrique | OVHcloud Roubaix + point de présence local (AWS af-south-1 Johannesburg) |
