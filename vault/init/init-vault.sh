#!/bin/bash
# Initialisation Vault — création des politiques et du moteur KV v2
set -euo pipefail

VAULT_ADDR="http://vault:8210"
VAULT_TOKEN="${VAULT_DEV_ROOT_TOKEN_ID:-root-dev-token-2026}"

export VAULT_ADDR VAULT_TOKEN

until vault status > /dev/null 2>&1; do
  echo "[Vault] Attente démarrage..."
  sleep 3
done

echo "[Vault] Activation du moteur KV v2..."
vault secrets enable -path=secret kv-v2 2>/dev/null || echo "Déjà activé"

echo "[Vault] Chargement des politiques..."
vault policy write pki-api /vault/policies/pki-api.hcl
vault policy write pki-readonly /vault/policies/pki-readonly.hcl

echo "[Vault] Création du token applicatif..."
vault token create \
  -policy=pki-api \
  -display-name="signature-api" \
  -ttl=8760h \
  -renewable=true 2>&1 | tee /vault/data/api-token.txt || true

echo "[Vault] Initialisation terminée."
