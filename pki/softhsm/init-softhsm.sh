#!/bin/bash
# =============================================================
# SoftHSM2 — Initialisation des slots pour les CA EJBCA
# Crée un slot par CA si non existant (idempotent)
# =============================================================
set -euo pipefail

PIN="${HSM_PIN:-changeme_hsm_2026!}"
SO_PIN="${HSM_SO_PIN:-so_${HSM_PIN:-changeme_hsm_2026!}}"

INIT_MARKER="/var/lib/softhsm/tokens/.initialized"

initialize_slot() {
  local label="$1"
  if ! softhsm2-util --show-slots 2>/dev/null | grep -q "${label}"; then
    echo "[SoftHSM2] Initialisation du slot : ${label}"
    softhsm2-util --init-token --free \
      --label "${label}" \
      --pin "${PIN}" \
      --so-pin "${SO_PIN}"
    echo "[SoftHSM2] Slot '${label}' créé."
  else
    echo "[SoftHSM2] Slot '${label}' déjà initialisé — skip."
  fi
}

mkdir -p /var/lib/softhsm/tokens

if [ ! -f "${INIT_MARKER}" ]; then
  echo "[SoftHSM2] Première initialisation..."
  initialize_slot "360DT-Root-CA"
  initialize_slot "360DT-Sub-Sig-CA"
  initialize_slot "360DT-Sub-TSA-CA"
  initialize_slot "360DT-Sub-OCSP-CA"
  touch "${INIT_MARKER}"
  echo "[SoftHSM2] Tous les slots initialisés."
else
  echo "[SoftHSM2] Tokens déjà initialisés — vérification..."
  softhsm2-util --show-slots
fi

echo "[SoftHSM2] Démarrage du service (veille)..."
exec tail -f /dev/null
