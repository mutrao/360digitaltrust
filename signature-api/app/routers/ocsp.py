"""Service OCSP — vérification de statut de certificat en ligne."""
import base64
import hashlib
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import structlog

from app.config import settings
from app.services.cache import CacheService

log = structlog.get_logger()
router = APIRouter()


class OcspCheckRequest(BaseModel):
    certificate_pem: str          # Certificat à vérifier (PEM)
    issuer_pem: str               # Certificat de l'émetteur (PEM)


@router.post("/check", summary="Vérifier le statut OCSP d'un certificat")
async def check_ocsp(req: OcspCheckRequest):
    """
    Interroge le répondeur OCSP EJBCA pour vérifier l'état d'un certificat.
    Réponse mise en cache Redis (TTL configurable).
    """
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.x509 import ocsp

        cert = x509.load_pem_x509_certificate(req.certificate_pem.encode())
        issuer = x509.load_pem_x509_certificate(req.issuer_pem.encode())

        # Clé de cache : hash du serial + issuer
        cache_key = f"ocsp:{cert.serial_number}:{issuer.subject.rfc4514_string()}"
        cached = await CacheService.get(cache_key)
        if cached:
            log.info("ocsp.cache_hit", serial=cert.serial_number)
            return {"status": "cached", "ocsp_response_b64": base64.b64encode(cached).decode()}

        # Construction de la requête OCSP
        builder = ocsp.OCSPRequestBuilder()
        builder = builder.add_certificate(cert, issuer, hashes.SHA256())
        ocsp_request = builder.build()
        ocsp_request_bytes = ocsp_request.public_bytes(serialization.Encoding.DER)

        # Envoi au répondeur EJBCA
        async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
            resp = await client.post(
                settings.OCSP_URL,
                content=ocsp_request_bytes,
                headers={"Content-Type": "application/ocsp-request"},
            )
            resp.raise_for_status()
            ocsp_response_bytes = resp.content

        # Décoder la réponse
        ocsp_resp = ocsp.load_der_ocsp_response(ocsp_response_bytes)
        status_map = {
            ocsp.OCSPCertStatus.GOOD: "GOOD",
            ocsp.OCSPCertStatus.REVOKED: "REVOKED",
            ocsp.OCSPCertStatus.UNKNOWN: "UNKNOWN",
        }
        cert_status = status_map.get(ocsp_resp.certificate_status, "UNKNOWN")

        # Mise en cache
        await CacheService.set(cache_key, ocsp_response_bytes, ttl=int(settings.REDIS_URL.split("/")[-1] or 3600))

        log.info("ocsp.checked", serial=cert.serial_number, status=cert_status)
        return {
            "status": cert_status,
            "serial": hex(cert.serial_number),
            "ocsp_response_b64": base64.b64encode(ocsp_response_bytes).decode(),
        }

    except Exception as e:
        log.error("ocsp.error", error=str(e))
        raise HTTPException(status_code=502, detail=f"Erreur OCSP : {e}")
