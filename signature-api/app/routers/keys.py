"""API de gestion des clés cryptographiques."""
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal

from app.services.key_manager import KeyManager

router = APIRouter()


class GenerateKeyRequest(BaseModel):
    algorithm: Literal["RSA", "EC"] = "RSA"
    key_size: int = 2048          # RSA
    curve: str = "P-256"          # EC
    common_name: str
    organization: str = "360DigitalTrust"
    country: str = "FR"
    email: str | None = None
    store_in_vault: bool = True


class GenerateKeyResponse(BaseModel):
    key_id: str
    csr_pem: str
    algorithm: str


@router.post("/generate", response_model=GenerateKeyResponse, summary="Générer une paire de clés")
async def generate_key(req: GenerateKeyRequest):
    """
    Génère une paire de clés RSA ou EC et retourne un CSR PKCS#10.
    La clé privée est stockée dans Vault si `store_in_vault=true`.
    """
    key_id = str(uuid.uuid4())

    if req.algorithm == "RSA":
        private_key = KeyManager.generate_rsa_key(req.key_size)
    else:
        private_key = KeyManager.generate_ec_key(req.curve)

    csr_pem = KeyManager.build_csr(
        private_key,
        common_name=req.common_name,
        organization=req.organization,
        country=req.country,
        email=req.email,
    )

    if req.store_in_vault:
        try:
            KeyManager.store_key_in_vault(key_id, private_key)
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Vault inaccessible : {e}")

    return GenerateKeyResponse(key_id=key_id, csr_pem=csr_pem, algorithm=req.algorithm)
