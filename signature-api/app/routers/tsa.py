"""Service TSA — Horodatage RFC 3161 via EJBCA TSA intégrée."""
import base64
import hashlib
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal
import structlog

from app.config import settings

log = structlog.get_logger()
router = APIRouter()

TSA_URL_EJBCA = "http://pki-ca:8009/ejbca/publicweb/apply/tsa"


class TimestampRequest(BaseModel):
    data_b64: str                                         # Données à horodater (base64)
    hash_algorithm: Literal["sha256", "sha384", "sha512"] = "sha256"
    request_cert: bool = True                             # Inclure certificat TSA dans la réponse


@router.post("/timestamp", summary="Horodater des données (RFC 3161)")
async def timestamp(req: TimestampRequest):
    """
    Crée un tampon d'horodatage RFC 3161 via la TSA EJBCA intégrée.
    Retourne le TimeStampToken (TST) en base64.
    """
    try:
        from pyhanko_certvalidator import tsp
        import asn1crypto.tsp as asn1_tsp
        import asn1crypto.core as asn1_core
        import os

        data = base64.b64decode(req.data_b64)

        # Calculer le hash
        alg_map = {
            "sha256": (hashlib.sha256, "2.16.840.1.101.3.4.2.1"),
            "sha384": (hashlib.sha384, "2.16.840.1.101.3.4.2.2"),
            "sha512": (hashlib.sha512, "2.16.840.1.101.3.4.2.3"),
        }
        hash_fn, hash_oid = alg_map[req.hash_algorithm]
        data_hash = hash_fn(data).digest()

        # Construire la requête TSA (RFC 3161 TimeStampReq)
        nonce = int.from_bytes(os.urandom(8), "big")
        tsp_req = asn1_tsp.TimeStampReq({
            "version": 1,
            "message_imprint": {
                "hash_algorithm": {"algorithm": hash_oid},
                "hashed_message": data_hash,
            },
            "nonce": nonce,
            "cert_req": req.request_cert,
        })
        tsp_req_bytes = tsp_req.dump()

        # Envoyer à la TSA EJBCA
        async with httpx.AsyncClient(verify=False, timeout=15.0) as client:
            resp = await client.post(
                TSA_URL_EJBCA,
                content=tsp_req_bytes,
                headers={"Content-Type": "application/timestamp-query"},
            )
            resp.raise_for_status()

        tst_bytes = resp.content
        tsp_resp = asn1_tsp.TimeStampResp.load(tst_bytes)
        status_str = str(tsp_resp["status"]["status"].native)

        log.info("tsa.timestamp.ok", status=status_str, hash_alg=req.hash_algorithm)
        return {
            "status": status_str,
            "hash_algorithm": req.hash_algorithm,
            "timestamp_token_b64": base64.b64encode(tst_bytes).decode(),
            "size_bytes": len(tst_bytes),
        }

    except Exception as e:
        log.error("tsa.error", error=str(e))
        raise HTTPException(status_code=502, detail=f"Erreur TSA : {e}")
