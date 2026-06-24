"""Signature CAdES — CMS Advanced Electronic Signature (ETSI EN 319 122)."""
import base64
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import pkcs7
import structlog

from app.services.key_manager import KeyManager

log = structlog.get_logger()
router = APIRouter()


class SignCmsRequest(BaseModel):
    data_b64: str                             # Données à signer en base64
    key_id: str
    certificate_pem: str
    detached: bool = True                     # True = CAdES détaché, False = attaché
    digest_algorithm: Literal["sha256", "sha384", "sha512"] = "sha256"


@router.post("/sign", summary="Signer des données (CAdES/CMS)")
async def sign_cms(req: SignCmsRequest):
    """
    Crée une signature CMS/PKCS#7 (CAdES-BES).
    Retourne la signature en base64 (détachée ou attachée).
    """
    try:
        data = base64.b64decode(req.data_b64)
        private_key = KeyManager.load_key_from_vault(req.key_id)
        cert = x509.load_pem_x509_certificate(req.certificate_pem.encode())

        alg_map = {
            "sha256": hashes.SHA256(),
            "sha384": hashes.SHA384(),
            "sha512": hashes.SHA512(),
        }
        digest = alg_map[req.digest_algorithm]

        # Construction PKCS7 signé
        builder = pkcs7.PKCS7SignatureBuilder()
        builder = builder.set_data(data)
        builder = builder.add_signer(cert, private_key, digest)

        options = [pkcs7.PKCS7Options.DetachedSignature] if req.detached else []
        signature = builder.sign(serialization.Encoding.DER, options)

        log.info("sign.cms.ok", key_id=req.key_id, detached=req.detached, size=len(signature))

        return {
            "status": "signed",
            "format": "CAdES",
            "detached": req.detached,
            "signature_b64": base64.b64encode(signature).decode(),
            "size_bytes": len(signature),
        }

    except Exception as e:
        log.error("sign.cms.error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Erreur signature CAdES : {e}")
