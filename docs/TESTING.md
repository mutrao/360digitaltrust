# Guide de test — 360DigitalTrust PKI

> Tous les tests supposent la stack démarrée : `docker compose up -d`
> et la PKI initialisée (voir `INSTALLATION.md`).

---

## 1. Tests de santé (health checks)

```bash
# Signature API
curl http://localhost:8080/health
# {"status":"ok","service":"signature-api","version":"1.0.0"}

# EJBCA
curl -sk https://localhost:8443/ejbca/publicweb/healthcheck/ejbcahealth
# ALLOK

# Vault
curl http://localhost:8200/v1/sys/health | python3 -m json.tool
```

---

## 2. Test de la Swagger UI

Ouvrir dans le navigateur : **http://localhost:8080/docs**

Vous verrez tous les endpoints groupés :
- Clés, Certificats, Signature PAdES, Signature XAdES, Signature CAdES, OCSP, TSA

---

## 3. Test complet : générer une clé + émettre un certificat + signer

### 3.1 Générer une paire de clés

```bash
curl -s -X POST http://localhost:8080/v1/keys/generate \
  -H "Content-Type: application/json" \
  -d '{
    "algorithm": "RSA",
    "key_size": 2048,
    "common_name": "Jean Dupont",
    "organization": "ACME Corp",
    "country": "FR",
    "email": "jean.dupont@acme.fr",
    "store_in_vault": true
  }' | python3 -m json.tool
```

Sortie attendue :
```json
{
  "key_id": "a1b2c3d4-...",
  "csr_pem": "-----BEGIN CERTIFICATE REQUEST-----\n...",
  "algorithm": "RSA"
}
```

Sauvegarder le `key_id` et le `csr_pem` :
```bash
KEY_ID="<key_id du résultat>"
CSR_PEM="<csr_pem du résultat>"
```

### 3.2 Émettre un certificat de signature

```bash
curl -s -X POST http://localhost:8080/v1/certificates/issue \
  -H "Content-Type: application/json" \
  -d "{
    \"key_id\": \"${KEY_ID}\",
    \"csr_pem\": $(echo $CSR_PEM | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'),
    \"cert_type\": \"signature\",
    \"subject_dn\": \"CN=Jean Dupont,O=ACME Corp,C=FR\",
    \"username\": \"jean.dupont\"
  }" | python3 -m json.tool
```

### 3.3 Signer un PDF (PAdES)

```bash
# Créer un PDF de test
python3 -c "
import base64
# Mini PDF valide
pdf = b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj xref 0 4 0000000000 65535 f 0000000009 00000 n 0000000058 00000 n 0000000115 00000 n trailer<</Size 4/Root 1 0 R>>startxref 190 %%EOF'
print(base64.b64encode(pdf).decode())
" > /tmp/test_pdf_b64.txt

PDF_B64=$(cat /tmp/test_pdf_b64.txt)
CERT_PEM="<certificat PEM reçu à l'étape 3.2>"

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

---

## 4. Test de signature XML (XAdES)

```bash
# Document XML de test
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

---

## 5. Test de signature CMS (CAdES)

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

## 6. Test OCSP (vérification statut certificat)

```bash
# Utiliser le certificat et son émetteur (Sub-CA Signature)
ISSUER_PEM=$(curl -sk https://localhost:8443/ejbca/ejbca-rest-api/v1/ca/360DT-Sub-Signature-CA/certificate/download)

curl -s -X POST http://localhost:8080/v1/ocsp/check \
  -H "Content-Type: application/json" \
  -d "{
    \"certificate_pem\": $(echo $CERT_PEM | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'),
    \"issuer_pem\": $(echo $ISSUER_PEM | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')
  }" | python3 -m json.tool
# Attendu : {"status": "GOOD", ...}
```

---

## 7. Test horodatage TSA (RFC 3161)

```bash
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

## 8. Test de charge (k6)

Installer [k6](https://k6.io) puis :

```bash
# Installer k6
brew install k6  # macOS
# ou
docker pull grafana/k6

# Lancer le test de charge
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

export default function () {
  const res = http.get('http://localhost:8080/health');
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(0.1);
}
EOF
```

---

## 9. Vérification des logs

```bash
# Logs de la Signature API (structurés JSON)
docker compose logs signature-api --tail=50

# Logs EJBCA
docker compose logs pki-ca --tail=50

# Audit log EJBCA
docker compose exec pki-ca cat /opt/ejbca/p12/hardtoken/

# Métriques Prometheus
curl http://localhost:8080/metrics
```

---

## 10. Tests automatiques (pytest)

```bash
# Installer les dépendances de test
pip install pytest pytest-asyncio httpx

# Lancer les tests
cd signature-api
pytest tests/ -v
```

```python
# signature-api/tests/test_health.py (exemple)
import pytest
import httpx

@pytest.mark.asyncio
async def test_health():
    async with httpx.AsyncClient(base_url="http://localhost:8080") as client:
        r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
```
