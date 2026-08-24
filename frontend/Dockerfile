# ─── Étape 1 : compilation ────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Couche de dépendances séparée : le cache survit aux modifications du code.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund

COPY . .

# Injectées par le CI pour tracer précisément ce qui est déployé.
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=${GIT_COMMIT}

RUN npm run build

# ─── Étape 2 : exécution ──────────────────────────────────────────
FROM nginx:1.27-alpine

RUN apk add --no-cache curl

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker-entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh

RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost/healthz || exit 1
