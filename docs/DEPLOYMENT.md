# Déploiement On-Premise

> Le client doit pouvoir changer l'URL du backend, le realm Keycloak et le
> branding **sans reconstruire l'image**. C'est la contrainte qui structure
> tout ce document.

---

## 1. Principe

```
                  ┌──────────────────────────────┐
   Navigateur ───►│  frontend (Nginx)  :80       │
                  │   /            → SPA         │
                  │   /api/        → proxy       │──► signature-api :8000
                  │   /config/…    → runtime cfg │
                  └──────────────────────────────┘
                                                  ──► Keycloak (OIDC, direct)
```

Au démarrage du conteneur, `docker-entrypoint.sh` lit les variables
d'environnement et écrit `/config/runtime-config.json`. Le navigateur charge ce
fichier **avant** de monter React. Aucune URL client n'existe dans le bundle.

Redémarrer le conteneur suffit à changer de configuration.

---

## 2. Installation avec la stack complète

```bash
git clone https://github.com/mutrao/360digitaltrust.git
cd 360digitaltrust
cp .env.example .env         # adapter les mots de passe
docker compose up -d
```

L'interface est disponible sur `http://localhost:3001`.

Sans configuration Keycloak, l'application démarre **sans authentification** :
un bandeau d'avertissement l'indique en permanence. C'est le mode d'installation
initiale, à ne jamais laisser en production.

---

## 3. Configuration

Toutes les variables sont lues au démarrage du conteneur `frontend`.

| Variable | Défaut | Rôle |
|---|---|---|
| `API_BASE_URL` | `/api` | Adresse du backend vue du navigateur |
| `KEYCLOAK_URL` | — | URL du serveur Keycloak |
| `KEYCLOAK_REALM` | — | Nom du realm |
| `KEYCLOAK_CLIENT_ID` | `esign-frontend` | Client **public** |
| `BRANDING_COMPANY_NAME` | `360DigitalTrust` | Nom affiché |
| `BRANDING_PRODUCT_NAME` | `Signature électronique` | Sous-titre |
| `BRANDING_LOGO_URL` | — | Logo (même hôte de préférence) |
| `BRANDING_ACCENT_RGB` | `27 95 168` | Couleur d'accent, format `r g b` |
| `BRANDING_SUPPORT_EMAIL` | — | Contact affiché dans l'aide |
| `BRANDING_LEGAL_URL` | — | Mentions légales |
| `DEFAULT_LOCALE` | `fr` | `fr` ou `en` |

**Aucun secret n'est accepté ici.** Tout ce qui est fourni au frontend est
lisible par l'utilisateur : c'est une propriété du web, pas un défaut.

### Exemple client

```yaml
services:
  frontend:
    image: 360dt/frontend:1.0.0
    ports: ['3001:80']
    environment:
      API_BASE_URL: /api
      KEYCLOAK_URL: https://sso.banque.local
      KEYCLOAK_REALM: banque
      KEYCLOAK_CLIENT_ID: esign-frontend
      BRANDING_COMPANY_NAME: Banque Nationale de Crédit
      BRANDING_ACCENT_RGB: 12 74 110
      BRANDING_SUPPORT_EMAIL: support-si@banque.local
```

### Vérifier la configuration appliquée

```bash
curl -s http://localhost:3001/config/runtime-config.json | jq
```

Ou, dans l'interface : **Administration → Diagnostic**, qui contrôle réellement
chaque dépendance plutôt que d'afficher des voyants décoratifs.

---

## 4. Image autonome

Le frontend n'a besoin ni de la stack PKI ni de Docker Compose :

```bash
docker build -t 360dt/frontend:1.0.0 ./frontend

docker run -d --name esign-frontend -p 3001:80 \
  -e API_BASE_URL=https://signature-api.client.local \
  -e KEYCLOAK_URL=https://sso.client.local \
  -e KEYCLOAK_REALM=client \
  -e KEYCLOAK_CLIENT_ID=esign-frontend \
  -e BRANDING_COMPANY_NAME="Client SA" \
  360dt/frontend:1.0.0
```

Quand `API_BASE_URL` pointe vers un autre hôte, le proxy Nginx interne n'est
plus utilisé : le backend doit alors autoriser l'origine du frontend en CORS.

Pour tracer précisément ce qui est déployé :

```bash
docker build --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
  -t 360dt/frontend:1.0.0 ./frontend
```

La révision apparaît dans **Administration → À propos**.

---

## 5. Reverse proxy

L'application ne suppose aucune topologie particulière. Deux options
fonctionnent.

### Option A — un seul domaine (recommandée)

```nginx
server {
    listen 443 ssl http2;
    server_name signature.client.local;

    ssl_certificate     /etc/ssl/certs/signature.crt;
    ssl_certificate_key /etc/ssl/private/signature.key;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    }
}
```

`API_BASE_URL=/api` : le frontend relaie lui-même vers `signature-api`. Aucune
configuration CORS n'est nécessaire.

### Option B — domaines séparés

```
https://signature.client.local   → frontend
https://api.client.local         → signature-api
https://sso.client.local         → Keycloak
```

`API_BASE_URL=https://api.client.local`. Il faut alors :

- autoriser l'origine du frontend dans `CORS_ORIGINS` de `signature-api` ;
- déclarer la même origine dans **Web origins** du client Keycloak.

### TLS obligatoire

`crypto.subtle` n'existe que dans un contexte sécurisé. **En HTTP sur un nom
d'hôte autre que `localhost`, la signature ne fonctionne pas.** Le Diagnostic
détecte et signale ce cas.

---

## 6. Keycloak

Configuration du client — voir [`KEYCLOAK.md`](KEYCLOAK.md) pour la procédure
complète :

```
Client ID                   esign-frontend
Client authentication       Off  (client public)
Standard flow               On
Direct access grants        Off
PKCE Code Challenge Method  S256
Valid redirect URIs         https://signature.client.local/auth/callback
Valid post logout URIs      https://signature.client.local
Web origins                 https://signature.client.local
```

Rôles de realm reconnus : `user`, `manager`, `admin`. Les préfixes `ROLE_` et
`esign-` sont tolérés, la casse est ignorée.

---

## 7. Santé et supervision

```bash
curl -fsS http://localhost:3001/healthz    # frontend  → OK
curl -fsS http://localhost:8080/health     # backend   → {"status":"ok",…}
curl -s   http://localhost:3001/api/v1/capabilities | jq
```

Le conteneur déclare un `HEALTHCHECK` : `docker compose ps` affiche `healthy`
lorsque Nginx répond.

---

## 8. Mise à jour

```bash
git pull
docker compose build frontend
docker compose up -d frontend
```

Les ressources sous `/assets/` sont versionnées par empreinte et servies en
`immutable` ; `index.html` et la configuration runtime ne sont jamais mis en
cache. Un rechargement suffit côté utilisateur.

---

## 9. Résolution de problèmes

| Symptôme | Cause probable | Correctif |
|---|---|---|
| Page blanche | `runtime-config.json` absent ou invalide | `docker compose logs frontend` ; vérifier l'entrypoint |
| « Service injoignable » | `signature-api` non démarré | `docker compose ps signature-api` |
| Boucle de redirection Keycloak | `redirect_uri` non déclarée | Ajouter l'URI exacte dans le client |
| « Keycloak injoignable » au Diagnostic | CORS ou TLS | Ajouter l'origine dans **Web origins** |
| Signature impossible, erreur Web Crypto | Servi en HTTP | Activer TLS |
| « Clé introuvable » à la signature | Clé perdue au redémarrage | Monter un volume sur `/app/keys` ou utiliser Vault |
| Erreur 503 Vault | Vault non démarré | `docker compose --profile vault up -d vault` puis redémarrer l'API |

Le premier réflexe reste **Administration → Diagnostic** : chaque contrôle y est
réellement exécuté.
