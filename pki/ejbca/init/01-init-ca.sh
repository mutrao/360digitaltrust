#!/bin/bash
# =============================================================
# EJBCA — Initialisation de la hiérarchie PKI 360DigitalTrust
# Exécuter UNE SEULE FOIS après le premier démarrage EJBCA
# Usage : docker compose exec pki-ca bash /opt/ejbca/init/01-init-ca.sh
# =============================================================
set -euo pipefail

EJBCA_CLI="/opt/ejbca/bin/ejbca.sh"
MARKER="/mnt/persistent/.pki_initialized"
PIN="${CA_TOKEN_PIN:-changeme_hsm_2026!}"

if [ -f "${MARKER}" ]; then
  echo "[INIT] PKI déjà initialisée."
  exit 0
fi

echo "[INIT] Vérification EJBCA..."
until curl -skf https://localhost:8443/ejbca/publicweb/healthcheck/ejbcahealth | grep -q ALLOK; do
  echo "[INIT] Attente EJBCA..."
  sleep 10
done
echo "[INIT] EJBCA prêt."

# -----------------------------------------------------------
# Étape 1 : Activer l'API REST
# -----------------------------------------------------------
echo "[INIT] Activation de l'API REST..."
${EJBCA_CLI} config protocols --enable --protocol REST 2>&1 || \
  echo "[INIT] REST peut-être déjà activé ou non supporté en CLI — activer via adminweb"

# -----------------------------------------------------------
# Étape 2 : Créer la Root CA (20 ans, RSA 4096)
# -----------------------------------------------------------
echo "[INIT] Création Root CA..."
${EJBCA_CLI} ca createca \
  --caname "360DT-Root-CA" \
  --dn "CN=360DigitalTrust Root CA,O=360DigitalTrust,C=FR" \
  --keyspec "RSA4096" \
  --keytype "RSA" \
  --validity "7300" \
  --policy "null" \
  --sigalg "SHA512WithRSA" \
  --tokenpwd "${PIN}" 2>&1 || echo "[INIT] Root CA déjà existante"

# -----------------------------------------------------------
# Étape 3 : Sub-CA Signature (10 ans, RSA 4096)
# -----------------------------------------------------------
echo "[INIT] Création Sub-CA Signature..."
${EJBCA_CLI} ca createca \
  --caname "360DT-Sub-Signature-CA" \
  --dn "CN=360DigitalTrust Signature CA,O=360DigitalTrust,C=FR" \
  --keyspec "RSA4096" \
  --keytype "RSA" \
  --validity "3650" \
  --policy "null" \
  --sigalg "SHA256WithRSA" \
  --signedby "360DT-Root-CA" \
  --tokenpwd "${PIN}" 2>&1 || echo "[INIT] Sub-CA Signature déjà existante"

# -----------------------------------------------------------
# Étape 4 : Sub-CA TSA (10 ans, RSA 4096)
# -----------------------------------------------------------
echo "[INIT] Création Sub-CA TSA..."
${EJBCA_CLI} ca createca \
  --caname "360DT-Sub-TSA-CA" \
  --dn "CN=360DigitalTrust TSA CA,O=360DigitalTrust,C=FR" \
  --keyspec "RSA4096" \
  --keytype "RSA" \
  --validity "3650" \
  --policy "null" \
  --sigalg "SHA256WithRSA" \
  --signedby "360DT-Root-CA" \
  --tokenpwd "${PIN}" 2>&1 || echo "[INIT] Sub-CA TSA déjà existante"

# -----------------------------------------------------------
# Étape 5 : Sub-CA OCSP (5 ans, RSA 2048)
# -----------------------------------------------------------
echo "[INIT] Création Sub-CA OCSP..."
${EJBCA_CLI} ca createca \
  --caname "360DT-Sub-OCSP-CA" \
  --dn "CN=360DigitalTrust OCSP CA,O=360DigitalTrust,C=FR" \
  --keyspec "RSA2048" \
  --keytype "RSA" \
  --validity "1825" \
  --policy "null" \
  --sigalg "SHA256WithRSA" \
  --signedby "360DT-Root-CA" \
  --tokenpwd "${PIN}" 2>&1 || echo "[INIT] Sub-CA OCSP déjà existante"

# -----------------------------------------------------------
# Étape 6 : Publication initiale des CRL
# -----------------------------------------------------------
echo "[INIT] Publication des CRL..."
${EJBCA_CLI} ca createcrl --all 2>&1 || true

touch "${MARKER}"
echo ""
echo "[INIT] ============================================"
echo "[INIT] Hiérarchie PKI initialisée avec succès !"
echo "[INIT] ============================================"
echo "[INIT] CA créées :"
echo "[INIT]   - 360DT-Root-CA"
echo "[INIT]   - 360DT-Sub-Signature-CA"
echo "[INIT]   - 360DT-Sub-TSA-CA"
echo "[INIT]   - 360DT-Sub-OCSP-CA"
echo ""
echo "[INIT] IMPORTANT : activer l'API REST dans l'adminweb si non fait :"
echo "[INIT] https://localhost:8443/ejbca/adminweb/"
echo "[INIT] System Configuration → Protocol Configuration → Activer REST"
