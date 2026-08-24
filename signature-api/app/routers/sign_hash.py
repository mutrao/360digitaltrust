"""Signature basée sur le hash uniquement — zéro exposition du document.

Flux :
  1. Client calcule SHA-256 du document localement (navigateur ou CLI)
  2. Envoie UNIQUEMENT le hash à l'API
  3. L'API signe le hash avec la clé privée
  4. Retourne la signature détachée (CMS/PKCS#7)
  5. Client réintègre la signature dans le document si besoin

Le document original ne quitte JAMAIS le poste du signataire.
"""
import base64
import hashlib
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
from cryptography.hazmat.primitives.asymmetric.ec import ECDSA
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from cryptography.hazmat.primitives.asymmetric.ec import EllipticCurvePrivateKey
import structlog

from app.services.key_manager import KeyManager
from app.services.audit_store import AuditStore

log = structlog.get_logger()
router = APIRouter()


class SignHashRequest(BaseModel):
    key_id: str                                        # ID de la clé dans le store
    certificate_pem: str                               # Certificat du signataire
    document_hash_b64: str                             # Hash du document en base64
    hash_algorithm: Literal["sha256", "sha384", "sha512"] = "sha256"
    document_name: str = "document"                    # Nom pour l'audit
    document_mime: str = "application/pdf"             # Type MIME pour l'audit
    signer_id: str = "anonymous"                       # ID utilisateur pour l'audit


class SignHashResponse(BaseModel):
    signature_id: str
    signature_b64: str          # Signature CMS détachée
    signed_at: str              # Horodatage ISO 8601
    hash_algorithm: str
    document_hash_b64: str      # Echo du hash reçu (vérification)
    certificate_subject: str


@router.post("/sign", response_model=SignHashResponse,
             summary="Signer un hash de document (document non transmis)")
async def sign_hash(req: SignHashRequest):
    """
    ## Signature préservant la confidentialité

    Le **document original ne transite pas** par le serveur.
    Seul son hash SHA-256/384/512 est envoyé.

    ### Calcul du hash côté client (JavaScript)
    ```javascript
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
    ```

    ### Calcul du hash côté client (Python)
    ```python
    import hashlib, base64
    h = hashlib.sha256(open('doc.pdf','rb').read()).digest()
    hash_b64 = base64.b64encode(h).decode()
    ```
    """
    try:
        doc_hash = base64.b64decode(req.document_hash_b64)

        # Vérification de la taille du hash
        expected = {"sha256": 32, "sha384": 48, "sha512": 64}
        if len(doc_hash) != expected[req.hash_algorithm]:
            raise HTTPException(
                status_code=400,
                detail=f"Hash invalide : attendu {expected[req.hash_algorithm]} octets pour {req.hash_algorithm}"
            )

        private_key = KeyManager.load_key(req.key_id)
        cert = x509.load_pem_x509_certificate(req.certificate_pem.encode())

        alg_map = {
            "sha256": hashes.SHA256(),
            "sha384": hashes.SHA384(),
            "sha512": hashes.SHA512(),
        }
        digest = alg_map[req.hash_algorithm]

        # Signature du hash avec la clé privée
        if isinstance(private_key, RSAPrivateKey):
            raw_sig = private_key.sign(doc_hash, asym_padding.PKCS1v15(), digest)
        elif isinstance(private_key, EllipticCurvePrivateKey):
            raw_sig = private_key.sign(doc_hash, ECDSA(digest))
        else:
            raise HTTPException(status_code=400, detail="Type de clé non supporté")

        signature_id = str(uuid.uuid4())
        signed_at = datetime.now(timezone.utc).isoformat()

        # Enregistrement dans l'audit
        await AuditStore.log({
            "event": "sign_hash",
            "signature_id": signature_id,
            "signer_id": req.signer_id,
            "document_name": req.document_name,
            "document_mime": req.document_mime,
            "hash_algorithm": req.hash_algorithm,
            "document_hash_b64": req.document_hash_b64,
            "certificate_subject": cert.subject.rfc4514_string(),
            "signed_at": signed_at,
        })

        log.info("sign.hash.ok", sig_id=signature_id, signer=req.signer_id,
                 doc=req.document_name, alg=req.hash_algorithm)

        return SignHashResponse(
            signature_id=signature_id,
            signature_b64=base64.b64encode(raw_sig).decode(),
            signed_at=signed_at,
            hash_algorithm=req.hash_algorithm,
            document_hash_b64=req.document_hash_b64,
            certificate_subject=cert.subject.rfc4514_string(),
        )

    except HTTPException:
        raise
    except KeyError as e:
        log.warning("sign.hash.key_not_found", key_id=req.key_id)
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        log.warning("sign.hash.bad_input", error=str(e))
        raise HTTPException(status_code=400, detail=f"Données invalides : {e}")
    except Exception as e:
        log.error("sign.hash.error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Erreur signature : {e}")
