"""Signature XAdES — XML Advanced Electronic Signature (ETSI EN 319 132)."""
import base64
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal
from lxml import etree
from signxml import XMLSigner, methods
import structlog

from app.services.key_manager import KeyManager

log = structlog.get_logger()
router = APIRouter()


class SignXmlRequest(BaseModel):
    xml_b64: str                              # Document XML en base64
    key_id: str
    certificate_pem: str
    method: Literal["enveloped", "enveloping", "detached"] = "enveloped"
    digest_algorithm: str = "sha256"
    signature_algorithm: str = "rsa-sha256"


@router.post("/sign", summary="Signer un document XML (XAdES)")
async def sign_xml(req: SignXmlRequest):
    """
    Signe un document XML au format XAdES-BES (enveloppé par défaut).
    Retourne le XML signé en base64.
    """
    try:
        xml_bytes = base64.b64decode(req.xml_b64)
        root = etree.fromstring(xml_bytes)

        private_key = KeyManager.load_key_from_vault(req.key_id)

        from cryptography.hazmat.primitives.serialization import (
            Encoding, PrivateFormat, NoEncryption
        )
        from cryptography import x509 as cx509

        cert = cx509.load_pem_x509_certificate(req.certificate_pem.encode())
        cert_der = cert.public_bytes(Encoding.DER)

        key_pem = private_key.private_bytes(
            Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()
        )

        method_map = {
            "enveloped": methods.enveloped,
            "enveloping": methods.enveloping,
            "detached": methods.detached,
        }

        signer = XMLSigner(
            method=method_map[req.method],
            digest_algorithm=req.digest_algorithm,
            signature_algorithm=req.signature_algorithm,
            c14n_algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
        )

        signed_root = signer.sign(
            root,
            key=key_pem,
            cert=cert_der,
        )

        signed_xml = etree.tostring(signed_root, pretty_print=True, xml_declaration=True, encoding="UTF-8")
        log.info("sign.xml.ok", key_id=req.key_id, method=req.method)

        return {
            "status": "signed",
            "format": "XAdES",
            "method": req.method,
            "signed_xml_b64": base64.b64encode(signed_xml).decode(),
            "size_bytes": len(signed_xml),
        }

    except Exception as e:
        log.error("sign.xml.error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Erreur signature XAdES : {e}")
