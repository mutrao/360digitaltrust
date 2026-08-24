#!/usr/bin/env bash
#
# Test de bout en bout de la plateforme, via le proxy du frontend.
#
# Exerce le parcours réel : génération de clé → empreinte locale → signature →
# workflow séquentiel → audit. Chaque étape est vérifiée, pas seulement lancée.
#
#   ./scripts/smoke-test.sh                     # http://localhost:3001
#   ./scripts/smoke-test.sh http://host:3001    # autre adresse
#
set -uo pipefail

BASE="${1:-http://localhost:3001}"
API="$BASE/api"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
ko()   { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
info() { printf '    %s\n' "$1"; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

jq_get() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)" 2>/dev/null; }

# ── 1. Disponibilité ──────────────────────────────────────────────
step "1. Disponibilité des services"

if curl -sf --max-time 5 "$BASE/healthz" >/dev/null; then
  ok "Frontend joignable ($BASE)"
else
  ko "Frontend injoignable ($BASE)"
  info "docker compose ps pki-frontend"
  exit 1
fi

HEALTH=$(curl -sf --max-time 5 "$API/v1/health")
if [ -n "$HEALTH" ]; then
  ok "API joignable via le proxy — version $(echo "$HEALTH" | jq_get "['version']")"
else
  ko "API injoignable derrière /api/"
  info "docker compose logs signature-api | tail -30"
  exit 1
fi

CAPS=$(curl -sf --max-time 5 "$API/v1/capabilities")
VAULT=$(echo "$CAPS" | jq_get "['storage']['vault_available']")
[ -n "$CAPS" ] && ok "Capacités déclarées — Vault disponible : $VAULT" \
                || ko "GET /v1/capabilities ne répond pas"

# ── 2. Génération de clé ──────────────────────────────────────────
step "2. Génération d'une paire de clés"

KEY=$(curl -sf --max-time 30 -X POST "$API/v1/keys/generate" \
  -H 'Content-Type: application/json' \
  -d '{"algorithm":"RSA","key_size":2048,"common_name":"Test Smoke","store_in_vault":false}')

KEY_ID=$(echo "$KEY" | jq_get "['key_id']")
if [ -n "$KEY_ID" ]; then
  ok "Clé RSA 2048 générée"
  info "key_id : $KEY_ID"
  info "stockage : $(echo "$KEY" | jq_get "['storage']")"
else
  ko "Échec de la génération de clé"
  exit 1
fi

echo "$KEY" | jq_get "['csr_pem']" | grep -q "BEGIN CERTIFICATE REQUEST" \
  && ok "CSR PKCS#10 retourné" || ko "CSR absent ou malformé"

# ── 3. Certificat de test ─────────────────────────────────────────
step "3. Certificat de test"

# ATTENTION : certificat auto-signé, valable uniquement pour exercer
# l'interface. Une signature juridiquement opposable exige un certificat
# émis par la hiérarchie EJBCA (voir docs/INSTALLATION.md étape 5).
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$TMP/t.key" -out "$TMP/t.crt" -days 1 \
  -subj "/CN=Test Smoke/O=360DigitalTrust/C=FR" >/dev/null 2>&1

[ -s "$TMP/t.crt" ] && ok "Certificat auto-signé créé (test uniquement)" \
                    || { ko "openssl a échoué"; exit 1; }

# ── 4. Signature hash-only ────────────────────────────────────────
step "4. Signature d'une empreinte"

echo "Document de test — $(date -u +%FT%TZ)" > "$TMP/doc.txt"
HASH=$(openssl dgst -sha256 -binary "$TMP/doc.txt" | base64 | tr -d '\n')
ok "Empreinte SHA-256 calculée localement"
info "${HASH:0:44}"

SIG=$(python3 - "$API" "$KEY_ID" "$HASH" "$TMP/t.crt" <<'PY'
import json, sys, urllib.request, urllib.error
api, key_id, digest, cert_path = sys.argv[1:5]
body = json.dumps({
    "key_id": key_id,
    "certificate_pem": open(cert_path).read(),
    "document_hash_b64": digest,
    "hash_algorithm": "sha256",
    "document_name": "smoke-test.txt",
    "document_mime": "text/plain",
    "signer_id": "smoke-test",
}).encode()
req = urllib.request.Request(f"{api}/v1/sign/hash/sign", body,
                             {"Content-Type": "application/json"})
try:
    print(urllib.request.urlopen(req, timeout=30).read().decode())
except urllib.error.HTTPError as e:
    print(json.dumps({"error": e.read().decode()}))
PY
)

SIG_ID=$(echo "$SIG" | jq_get "['signature_id']")
if [ -n "$SIG_ID" ]; then
  ok "Document signé"
  info "signature_id : $SIG_ID"
  info "sujet : $(echo "$SIG" | jq_get "['certificate_subject']")"
else
  ko "Signature refusée : $(echo "$SIG" | jq_get "['error']")"
fi

# ── 5. Vérification ───────────────────────────────────────────────
step "5. Vérification par l'audit"

if [ -n "$SIG_ID" ]; then
  ENTRY=$(curl -sf --max-time 10 "$API/v1/audit/logs/$SIG_ID")
  if [ -n "$ENTRY" ]; then
    ok "Signature retrouvée dans le journal d'audit"
    info "événement : $(echo "$ENTRY" | jq_get "['event']")"
  else
    ko "Signature absente de l'audit"
  fi

  ECHOED=$(echo "$SIG" | jq_get "['document_hash_b64']")
  [ "$ECHOED" = "$HASH" ] && ok "L'empreinte signée correspond au document" \
                          || ko "L'empreinte signée diffère du document"
fi

# ── 6. Workflow séquentiel ────────────────────────────────────────
step "6. Workflow séquentiel à deux signataires"

WF=$(python3 - "$API" "$HASH" <<'PY'
import json, sys, urllib.request, urllib.error
api, digest = sys.argv[1:3]
body = json.dumps({
    "title": "Smoke test — contrat",
    "document_name": "smoke-test.txt",
    "document_hash_b64": digest,
    "hash_algorithm": "sha256",
    "mode": "sequential",
    "created_by": "smoke-test",
    "signers": [
        {"user_id": "smoke-alice", "name": "Alice", "email": "a@test.local",
         "order": 1, "required": True},
        {"user_id": "smoke-bob", "name": "Bob", "email": "b@test.local",
         "order": 2, "required": True},
    ],
}).encode()
req = urllib.request.Request(f"{api}/v1/workflows/create", body,
                             {"Content-Type": "application/json"})
try:
    print(urllib.request.urlopen(req, timeout=20).read().decode())
except urllib.error.HTTPError as e:
    print(json.dumps({"error": e.read().decode()}))
PY
)

WF_ID=$(echo "$WF" | jq_get "['workflow_id']")
if [ -n "$WF_ID" ]; then
  ok "Workflow créé"
  info "workflow_id : $WF_ID"
else
  ko "Création du workflow refusée"
fi

sign_step() {  # $1 = signer_id
  python3 - "$API" "$WF_ID" "$1" "$KEY_ID" "$TMP/t.crt" <<'PY'
import json, sys, urllib.request, urllib.error
api, wf, signer, key_id, cert_path = sys.argv[1:6]
body = json.dumps({"workflow_id": wf, "signer_id": signer, "key_id": key_id,
                   "certificate_pem": open(cert_path).read()}).encode()
req = urllib.request.Request(f"{api}/v1/workflows/sign-step", body,
                             {"Content-Type": "application/json"})
try:
    print(urllib.request.urlopen(req, timeout=30).read().decode())
except urllib.error.HTTPError as e:
    print(json.dumps({"error": json.loads(e.read()).get("detail", "")}))
PY
}

if [ -n "$WF_ID" ] && [ -n "$KEY_ID" ]; then
  # L'ordre séquentiel doit être imposé par le serveur.
  OUT=$(sign_step "smoke-bob")
  if echo "$OUT" | grep -q "error"; then
    ok "Signature hors ordre correctement refusée"
    info "$(echo "$OUT" | jq_get "['error']")"
  else
    ko "Signature hors ordre acceptée — l'ordre séquentiel n'est pas appliqué"
  fi

  ST=$(sign_step "smoke-alice" | jq_get "['workflow_status']")
  [ "$ST" = "pending" ] && ok "Alice a signé — workflow encore en attente" \
                        || ko "Statut inattendu après la 1re signature : $ST"

  ST=$(sign_step "smoke-bob" | jq_get "['workflow_status']")
  [ "$ST" = "completed" ] && ok "Bob a signé — workflow finalisé" \
                          || ko "Statut inattendu après la 2e signature : $ST"
fi

# ── 7. Statistiques ───────────────────────────────────────────────
step "7. Journal d'audit"

STATS=$(curl -sf --max-time 10 "$API/v1/audit/stats")
if [ -n "$STATS" ]; then
  ok "Statistiques disponibles"
  info "signatures : $(echo "$STATS" | jq_get "['total_signatures']")"
  info "workflows  : $(echo "$STATS" | jq_get "['total_workflows']")"
  info "événements : $(echo "$STATS" | jq_get "['total_events']")"
else
  ko "GET /v1/audit/stats ne répond pas"
fi

# ── Bilan ─────────────────────────────────────────────────────────
printf '\n\033[1m── Bilan ──\033[0m\n'
printf '  réussis : %d\n  échoués : %d\n\n' "$PASS" "$FAIL"

if [ "$FAIL" -eq 0 ]; then
  printf '\033[32mLa plateforme fonctionne de bout en bout.\033[0m\n'
  printf 'Ouvrez %s pour tester l'"'"'interface.\n' "$BASE"
  exit 0
fi

printf '\033[31m%d contrôle(s) en échec.\033[0m\n' "$FAIL"
printf 'Consultez Administration → Diagnostic, ou :\n'
printf '  docker compose logs signature-api | tail -40\n'
exit 1
