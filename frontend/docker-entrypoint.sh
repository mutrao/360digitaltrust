#!/bin/sh
# Génère /config/runtime-config.json depuis l'environnement, au démarrage.
#
# C'est ce qui permet à une même image de servir plusieurs clients : l'URL du
# backend, le realm Keycloak et le branding ne sont jamais compilés dans le
# bundle JavaScript.
set -eu

TARGET=/usr/share/nginx/html/config/runtime-config.json
mkdir -p "$(dirname "$TARGET")"

# Échappe les guillemets, antislashs et retours de ligne pour produire du JSON valide.
json_escape() {
  printf '%s' "${1:-}" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\n\r'
}

cat > "$TARGET" <<EOF
{
  "apiBaseUrl": "$(json_escape "${API_BASE_URL:-/api}")",
  "keycloak": {
    "url": "$(json_escape "${KEYCLOAK_URL:-}")",
    "realm": "$(json_escape "${KEYCLOAK_REALM:-}")",
    "clientId": "$(json_escape "${KEYCLOAK_CLIENT_ID:-}")",
    "scope": "$(json_escape "${KEYCLOAK_SCOPE:-openid profile email}")"
  },
  "branding": {
    "companyName": "$(json_escape "${BRANDING_COMPANY_NAME:-360DigitalTrust}")",
    "productName": "$(json_escape "${BRANDING_PRODUCT_NAME:-Signature électronique}")",
    "logoUrl": "$(json_escape "${BRANDING_LOGO_URL:-}")",
    "accentRgb": "$(json_escape "${BRANDING_ACCENT_RGB:-27 95 168}")",
    "supportEmail": "$(json_escape "${BRANDING_SUPPORT_EMAIL:-}")",
    "legalNoticeUrl": "$(json_escape "${BRANDING_LEGAL_URL:-}")"
  },
  "defaultLocale": "$(json_escape "${DEFAULT_LOCALE:-fr}")"
}
EOF

if [ -n "${KEYCLOAK_URL:-}" ]; then
  echo "[runtime-config] Keycloak : ${KEYCLOAK_URL} (realm ${KEYCLOAK_REALM:-non défini})"
else
  echo "[runtime-config] Keycloak non configuré — accès sans authentification."
fi
echo "[runtime-config] API : ${API_BASE_URL:-/api}"
