# Guide de test — 360DigitalTrust PKI

> Tous les tests supposent la stack démarrée : `docker compose up -d`
> et la PKI initialisée (voir `INSTALLATION.md`).

---

## 1. Tests de santé (health checks)

```bash
# Signature API
curl http://localhost:8080/health
# {"status":"ok","service":"signature-api","version":"2.0.0"}

# Frontend (Nginx)
curl http://localhost:3001/health
# OK

# EJBCA
curl -sk https://localhost:8443/ejbca/publicweb/healthcheck/ejbcahealth
# ALLOK

# Vault (si profil vault activé)
curl http://localhost:8210/v1/sys/health | python3 -m json.tool
```

```bash
# Vérifier tous les services d'un coup
docker compose ps
```

---

## 2. Swagger UI — Documentation interactive

Ouvrir dans le navigateur : **http://localhost:8080/docs**

Endpoints disponibles :
- **Clés** : génération RSA/ECDSA
- **Hash signing** : signature privacy-first (hash uniquement)
- **Workflows** : signature multi-étapes séquentielle/parallèle/mixte
- **Audit** : historique et statistiques
- **Utilisateurs** : gestion des signataires
- **PAdES** : signature PDF
- **XAdES** : signature XML
- **CAdES** : signature CMS
- **OCSP** : vérification de révocation
- **TSA** : horodatage RFC 3161

---

## 3. Test Interface Web Frontend

```bash
# Ouvrir l'interface
open http://localhost:3001
```

### Parcours de test complet via l'interface

1. **Générer une clé** : section "Clés" → choisir RSA 2048 → cliquer Générer → copier l'ID
2. **Signer un document** :
   - Section "Signer un document"
   - Glisser un fichier PDF ou XML
   - Vérifier que le hash SHA-256 s'affiche (calculé localement par le navigateur)
   - Coller l'ID de clé
   - Cliquer "Signer (hash uniquement)"
   - Vérifier que la signature Base64 s'affiche
3. **Créer un workflow** :
   - Section "Nouveau workflow"
   - Cliquer 📋 pour coller le hash calculé à l'étape précédente
   - Ajouter 2-3 signataires
   - Choisir mode Séquentiel
   - Cliquer Créer
4. **Consulter l'audit** :
   - Section "Audit & Logs"
   - Vérifier que les événements `hash_signed` et `workflow_created` apparaissent
   - Tester l'export CSV
5. **Gérer les utilisateurs** :
   - Section "Utilisateurs" → bouton "+ Ajouter"
   - Créer un signataire et un auditeur

---

## 4. Test génération de clés (API)

```bash
# RSA 2048
curl -s -X POST http://localhost:8080/v1/keys/generate \
  -H "Content-Type: application/json" \
  -d '{"algorithm":"RSA","key_size":2048}' | python3 -m json.tool

# Réponse attendue :
# {
#   "key_id": "key-RSA-2048-xxxxxxxx",
#   "algorithm": "RSA",
#   "key_size": 2048,
#   "storage": "local"
# }

# Sauvegarder l'ID
KEY_ID=$(curl -s -X POST http://localhost:8080/v1/keys/generate \
  -H "Content-Type: application/json" \
  -d '{"algorithm":"RSA","key_size":2048}' | python3 -c "import sys,json; print(json.load(sys.stdin)['key_id'])")

echo "KEY_ID=$KEY_ID"
```

---

## 5. Test hash-only signing (privacy-first)

```bash
# Calculer le hash SHA-256 d'un fichier localement (côté client)
HASH_B64=$(echo -n "contenu du document à signer" | sha256sum | cut -d' ' -f1 | xxd -r -p | base64)
echo "Hash: $HASH_B64"

# Envoyer uniquement le hash (le document ne transite pas)
curl -s -X POST http://localhost:8080/v1/sign/hash/sign \
  -H "Content-Type: application/json" \
  -d "{
    \"key_id\": \"${KEY_ID}\",
    \"document_hash_b64\": \"${HASH_B64}\",
    \"hash_algorithm\": \"sha256\",
    \"signer_id\": \"test-signer-001\",
    \"metadata\": {\"reason\": \"Test hash signing\", \"location\": \"Paris\"}
  }" | python3 -m json.tool

# Réponse attendue :
# {
#   "signature_id": "sig-xxxxxxxx-xxxx-...",
#   "signature_b64": "...",
#   "signed_at": "2026-...",
#   "certificate_subject": null
# }
```

---

## 6. Test workflows multi-signataires

### 6.1 Créer un workflow séquentiel

```bash
HASH_B64=$(echo -n "contrat à signer" | sha256sum | cut -d' ' -f1 | xxd -r -p | base64)

WF_ID=$(curl -s -X POST http://localhost:8080/v1/workflows/create \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Approbation contrat Q4\",
    \"description\": \"Signature séquentielle — DG puis DAF\",
    \"document_hash_b64\": \"${HASH_B64}\",
    \"mode\": \"sequential\",
    \"signers\": [
      {\"signer_id\": \"alice\", \"email\": \"alice@acme.fr\", \"order\": 1},
      {\"signer_id\": \"bob\",   \"email\": \"bob@acme.fr\",   \"order\": 2}
    ]
  }" | python3 -c "import sys,json; print(json.load(sys.stdin)['workflow_id'])")

echo "WF_ID=$WF_ID"
```

### 6.2 Consulter l'état du workflow

```bash
curl -s http://localhost:8080/v1/workflows/${WF_ID} | python3 -m json.tool
```

### 6.3 Signer une étape

```bash
# Alice signe (ordre 1)
curl -s -X POST http://localhost:8080/v1/workflows/sign-step \
  -H "Content-Type: application/json" \
  -d "{
    \"workflow_id\": \"${WF_ID}\",
    \"signer_id\": \"alice\",
    \"key_id\": \"${KEY_ID}\"
  }" | python3 -m json.tool

# Bob signe ensuite (ordre 2)
curl -s -X POST http://localhost:8080/v1/workflows/sign-step \
  -H "Content-Type: application/json" \
  -d "{
    \"workflow_id\": \"${WF_ID}\",
    \"signer_id\": \"bob\",
    \"key_id\": \"${KEY_ID}\"
  }" | python3 -m json.tool
```

### 6.4 Vérifier la complétion

```bash
# Le statut doit passer à "completed" après la signature de Bob
curl -s http://localhost:8080/v1/workflows/${WF_ID} | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print('Statut:', d['status'])"
```

---

## 7. Test audit trail

```bash
# Lister les événements récents
curl -s "http://localhost:8080/v1/audit/logs?limit=10" | python3 -m json.tool

# Filtrer par type d'événement
curl -s "http://localhost:8080/v1/audit/logs?event_type=hash_signed" | python3 -m json.tool

# Filtrer par signataire
curl -s "http://localhost:8080/v1/audit/logs?signer_id=alice" | python3 -m json.tool

# Statistiques globales
curl -s http://localhost:8080/v1/audit/stats | python3 -m json.tool
# {
#   "by_event_type": {"hash_signed": 5, "key_generated": 2, ...},
#   "by_algorithm": {"sha256": 5}
# }

# Détail d'une signature spécifique
SIG_ID="sig-xxxxxxxx-xxxx-..."   # remplacer par un vrai ID
curl -s http://localhost:8080/v1/audit/logs/${SIG_ID} | python3 -m json.tool
```

---

## 8. Test gestion des utilisateurs

```bash
# Créer un signataire
curl -s -X POST http://localhost:8080/v1/users/ \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "alice-001",
    "full_name": "Alice Dupont",
    "email": "alice@acme.fr",
    "role": "signer",
    "department": "Juridique"
  }' | python3 -m json.tool

# Lister tous les utilisateurs
curl -s http://localhost:8080/v1/users/ | python3 -m json.tool

# Récupérer un utilisateur
curl -s http://localhost:8080/v1/users/alice-001 | python3 -m json.tool

# Désactiver un utilisateur
curl -s -X POST http://localhost:8080/v1/users/alice-001/deactivate | python3 -m json.tool
```

---

## 9. Test signatures documentaires (PAdES / XAdES / CAdES)

### 9.1 Générer une clé et un certificat

```bash
# Générer la clé
KEY_ID=$(curl -s -X POST http://localhost:8080/v1/keys/generate \
  -H "Content-Type: application/json" \
  -d '{"algorithm":"RSA","key_size":2048}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['key_id'])")

# Émettre un certificat
CERT_JSON=$(curl -s -X POST http://localhost:8080/v1/certificates/issue \
  -H "Content-Type: application/json" \
  -d "{
    \"key_id\": \"${KEY_ID}\",
    \"cert_type\": \"signature\",
    \"subject_dn\": \"CN=Jean Dupont,O=ACME Corp,C=FR\",
    \"username\": \"jean.dupont\"
  }")
CERT_PEM=$(echo $CERT_JSON | python3 -c "import sys,json; print(json.load(sys.stdin).get('certificate_pem',''))")
```

### 9.2 Signer un PDF (PAdES)

```bash
# Créer un PDF de test minimal
PDF_B64=$(python3 -c "
import base64
pdf = b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj xref 0 4 0000000000 65535 f 0000000009 00000 n 0000000058 00000 n 0000000115 00000 n trailer<</Size 4/Root 1 0 R>>startxref 190 %%EOF'
print(base64.b64encode(pdf).decode())")

curl -s -X POST http://localhost:8080/v1/sign/pdf/sign \
  -H "Content-Type: application/json" \
  -d "{
    \"pdf_b64\": \"${PDF_B64}\",
    \"key_id\": \"${KEY_ID}\",
    \"certificate_pem\": $(echo $CERT_PEM | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'),
    \"reason\": \"Test signature électronique\",
    \"location\": \"Paris, France\"
  }" | python3 -m json.tool
```

### 9.3 Signer un XML (XAdES)

```bash
XML_B64=$(echo '<?xml version="1.0"?><document><contenu>Contrat de test 360DT</contenu></document>' | base64)

curl -s -X POST http://localhost:8080/v1/sign/xml/sign \
  -H "Content-Type: application/json" \
  -d "{
    \"xml_b64\": \"${XML_B64}\",
    \"key_id\": \"${KEY_ID}\",
    \"certificate_pem\": $(echo $CERT_PEM | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'),
    \"method\": \"enveloped\"
  }" | python3 -m json.tool
```

### 9.4 Signer des données binaires (CAdES)

```bash
DATA_B64=$(echo 'Contenu à signer 360DigitalTrust' | base64)

curl -s -X POST http://localhost:8080/v1/sign/cms/sign \
  -H "Content-Type: application/json" \
  -d "{
    \"data_b64\": \"${DATA_B64}\",
    \"key_id\": \"${KEY_ID}\",
    \"certificate_pem\": $(echo $CERT_PEM | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'),
    \"detached\": true,
    \"digest_algorithm\": \"sha256\"
  }" | python3 -m json.tool
```

---

## 10. Test OCSP et TSA

```bash
# OCSP — vérification du statut d'un certificat
ISSUER_PEM=$(curl -sk https://localhost:8443/ejbca/ejbca-rest-api/v1/ca/360DT-Sub-Signature-CA/certificate/download)

curl -s -X POST http://localhost:8080/v1/ocsp/check \
  -H "Content-Type: application/json" \
  -d "{
    \"certificate_pem\": $(echo $CERT_PEM | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'),
    \"issuer_pem\": $(echo $ISSUER_PEM | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')
  }" | python3 -m json.tool
# Attendu : {"status": "GOOD", ...}

# TSA — horodatage RFC 3161
DATA_B64=$(echo 'Document à horodater' | base64)

curl -s -X POST http://localhost:8080/v1/tsa/timestamp \
  -H "Content-Type: application/json" \
  -d "{
    \"data_b64\": \"${DATA_B64}\",
    \"hash_algorithm\": \"sha256\",
    \"request_cert\": true
  }" | python3 -m json.tool
```

---

## 11. Test de charge (k6)

```bash
# Installer k6
brew install k6          # macOS
# ou via Docker
docker pull grafana/k6

# Test de charge sur la Signature API
docker run --rm --network=host grafana/k6 run - <<'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // montée progressive
    { duration: '2m',  target: 50 },   // charge nominale
    { duration: '30s', target: 100 },  // pic
    { duration: '1m',  target: 0 },    // descente
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],  // P95 < 3s
    http_req_failed:   ['rate<0.05'],   // Erreurs < 5%
  },
};

const BASE = 'http://localhost:8080';

export default function () {
  // Health check
  let r = http.get(`${BASE}/health`);
  check(r, { 'health ok': (r) => r.status === 200 });

  // Génération de clé
  r = http.post(`${BASE}/v1/keys/generate`,
    JSON.stringify({ algorithm: 'RSA', key_size: 2048 }),
    { headers: { 'Content-Type': 'application/json' } });
  check(r, { 'key generated': (r) => r.status === 200 });

  sleep(0.1);
}
EOF
```

---

## 12. Test depuis le Frontend (end-to-end)

Ce test valide l'intégration Frontend ↔ Signature API :

1. Ouvrir http://localhost:3001
2. Section **Clés** → Générer RSA 2048 → Copier l'ID
3. Section **Signer** → Glisser un fichier → Coller l'ID de clé → Signer
4. Vérifier la signature dans **Audit & Logs**
5. Créer un **Workflow** avec 2 signataires en mode Séquentiel
6. Vérifier dans **Workflows** que le statut est `pending`
7. Créer un **Utilisateur** → Vérifier dans la liste
8. Section **Audit** → Exporter CSV → Vérifier le fichier

---

## 13. Vérification des logs

```bash
# Logs de la Signature API (JSON structuré)
docker compose logs signature-api --tail=50

# Logs du Frontend (Nginx)
docker compose logs pki-frontend --tail=20

# Logs EJBCA
docker compose logs pki-ca --tail=50

# Métriques Prometheus exposées par la Signature API
curl http://localhost:8080/metrics | grep signature
```

---

## 14. Tests automatiques (pytest)

```bash
pip install pytest pytest-asyncio httpx

cd signature-api
pytest tests/ -v
```

```python
# signature-api/tests/test_endpoints.py
import pytest
import httpx

BASE = "http://localhost:8080"

@pytest.mark.asyncio
async def test_health():
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{BASE}/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

@pytest.mark.asyncio
async def test_key_generation():
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{BASE}/v1/keys/generate",
            json={"algorithm": "RSA", "key_size": 2048})
    assert r.status_code == 200
    data = r.json()
    assert "key_id" in data

@pytest.mark.asyncio
async def test_hash_sign():
    import hashlib, base64
    content = b"test document"
    h = base64.b64encode(hashlib.sha256(content).digest()).decode()
    async with httpx.AsyncClient() as c:
        key_r = await c.post(f"{BASE}/v1/keys/generate",
            json={"algorithm": "RSA", "key_size": 2048})
        key_id = key_r.json()["key_id"]
        r = await c.post(f"{BASE}/v1/sign/hash/sign",
            json={"key_id": key_id, "document_hash_b64": h, "hash_algorithm": "sha256"})
    assert r.status_code == 200
    assert "signature_id" in r.json()
    assert "signature_b64" in r.json()
```
