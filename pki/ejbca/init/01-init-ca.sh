#!/bin/bash
# =============================================================
# EJBCA — Initialisation de la hiérarchie PKI 360DigitalTrust
# Script exécuté une seule fois au premier démarrage
# Crée : Root CA → Sub-CA Signature, TSA, OCSP
# =============================================================
set -euo pipefail

EJBCA_CLI="/opt/ejbca/bin/ejbca.sh"
MARKER="/mnt/persistent/.pki_initialized"

if [ -f "${MARKER}" ]; then
  echo "[INIT] PKI déjà initialisée — skip."
  exit 0
fi

echo "[INIT] Attente démarrage EJBCA..."
until curl -skf https://localhost:8443/ejbca/publicweb/healthcheck/ejbcahealth; do
  sleep 10
done

PIN="${CA_TOKEN_PIN:-changeme_hsm_2026!}"
ADMIN_PWD="${EJBCA_CLI_DEFAULTPASSWORD:-changeme_admin_2026!}"

# --- 1. Profil de certificat Root CA ---
echo "[INIT] Création du profil Root CA..."
${EJBCA_CLI} ca createca \
  --caname "360DT-Root-CA" \
  --dn "CN=360DigitalTrust Root CA,O=360DigitalTrust,C=FR" \
  --keyspec "RSA4096" \
  --keytype "RSA" \
  --validity "7300" \
  --policy "null" \
  --sigalg "SHA512WithRSA" \
  --tokenpwd "${PIN}" 2>&1 || echo "[INIT] Root CA existe déjà"

# --- 2. Sub-CA Signature ---
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
  --tokenpwd "${PIN}" 2>&1 || echo "[INIT] Sub-CA Signature existe déjà"

# --- 3. Sub-CA TSA ---
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
  --tokenpwd "${PIN}" 2>&1 || echo "[INIT] Sub-CA TSA existe déjà"

# --- 4. Sub-CA OCSP ---
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
  --tokenpwd "${PIN}" 2>&1 || echo "[INIT] Sub-CA OCSP existe déjà"

# --- 5. Profils de certificats ---
echo "[INIT] Import des profils de certificats..."
for profile_file in /opt/ejbca/init/profiles/*.xml; do
  profile_name=$(basename "${profile_file}" .xml)
  ${EJBCA_CLI} ca importprofile \
    --certprofile "/opt/ejbca/init/profiles/${profile_name}.xml" 2>&1 || \
    echo "[INIT] Profil ${profile_name} déjà importé"
done

# --- 6. Export des certificats CA publics ---
echo "[INIT] Export des certificats CA..."
mkdir -p /mnt/persistent/ca-certs
for ca in "360DT-Root-CA" "360DT-Sub-Signature-CA" "360DT-Sub-TSA-CA" "360DT-Sub-OCSP-CA"; do
  ${EJBCA_CLI} ca getcacert \
    --caname "${ca}" \
    --cert "/mnt/persistent/ca-certs/${ca}.pem" 2>&1 || true
done

# --- 7. Publication initiale des CRL ---
echo "[INIT] Publication initiale des CRL..."
${EJBCA_CLI} ca createcrl --all 2>&1 || true

touch "${MARKER}"
echo "[INIT] Hiérarchie PKI initialisée avec succès."
