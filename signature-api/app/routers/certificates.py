"""API d'émission et de gestion des certificats X.509."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal

from app.services.ejbca import ejbca_client
from app.config import settings

router = APIRouter()


class IssueCertRequest(BaseModel):
    key_id: str
    csr_pem: str
    cert_type: Literal["signature", "tsa", "ocsp", "tls"] = "signature"
    subject_dn: str
    username: str


class RevokeCertRequest(BaseModel):
    issuer_dn: str
    serial_hex: str
    reason: Literal[
        "UNSPECIFIED", "KEY_COMPROMISE", "CA_COMPROMISE",
        "AFFILIATION_CHANGED", "SUPERSEDED", "CESSATION_OF_OPERATION",
        "CERTIFICATE_HOLD", "REMOVE_FROM_CRL", "PRIVILEGE_WITHDRAWN",
    ] = "UNSPECIFIED"


_CERT_PROFILES = {
    "signature": (settings.CA_SUB_SIGN_NAME, "signature-endentity", "EMPTY"),
    "tsa":       (settings.CA_SUB_TSA_NAME,  "tsa-endentity",       "EMPTY"),
    "ocsp":      (settings.CA_SUB_OCSP_NAME, "ocsp-responder",      "EMPTY"),
    "tls":       (settings.CA_SUB_SIGN_NAME, "signature-endentity", "EMPTY"),
}


@router.post("/issue", summary="Émettre un certificat X.509")
async def issue_certificate(req: IssueCertRequest):
    """
    Émet un certificat X.509 signé par la Sub-CA correspondante.
    Le CSR doit être en format PEM PKCS#10.
    """
    ca_name, cert_profile, ee_profile = _CERT_PROFILES.get(
        req.cert_type, _CERT_PROFILES["signature"]
    )
    try:
        result = await ejbca_client.issue_certificate(
            ca_name=ca_name,
            cert_profile=cert_profile,
            end_entity_profile=ee_profile,
            csr_pem=req.csr_pem,
            subject_dn=req.subject_dn,
            username=req.username,
        )
        return {"status": "issued", "certificate": result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"EJBCA erreur : {e}")


@router.post("/revoke", summary="Révoquer un certificat")
async def revoke_certificate(req: RevokeCertRequest):
    try:
        result = await ejbca_client.revoke_certificate(
            issuer_dn=req.issuer_dn,
            serial_hex=req.serial_hex,
            reason=req.reason,
        )
        return {"status": "revoked", "detail": result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"EJBCA erreur : {e}")


@router.get("/status/{issuer_dn}/{serial_hex}", summary="Statut d'un certificat")
async def certificate_status(issuer_dn: str, serial_hex: str):
    try:
        result = await ejbca_client.get_certificate_status(issuer_dn, serial_hex)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/cas", summary="Liste des CA disponibles")
async def list_cas():
    try:
        return await ejbca_client.list_cas()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
