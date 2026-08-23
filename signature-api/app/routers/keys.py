"""API de gestion des clés cryptographiques."""
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal

from app.services.key_manager import KeyManager

router = APIRouter()


class GenerateKeyRequest(BaseModel):
    algorithm: Literal["RSA", "EC"] = "RSA"
    key_size: int = 2048
    curve: str = "P-256"
    common_name: str
    organization: str = "360DigitalTrust"
    country: str = "FR"
    email: str | None = None
    store_in_vault: bool = False   # False par défaut — Vault optionnel


class GenerateKeyResponse(BaseModel):
    key_id: str
    csr_pem: str
    algorithm: str
    storage: str


@router.post("/generate", response_model=GenerateKeyResponse,
             summary="Générer une paire de clés")
async def generate_key(req: GenerateKeyRequest):
    """
    Génère une paire de clés RSA ou EC et retourne un CSR PKCS#10.
    La clé est stockée localement (Vault optionnel).
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

    try:
        KeyManager.store_key(key_id, private_key, use_vault=req.store_in_vault)
        storage = "vault" if req.store_in_vault else "local"
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur stockage clé : {e}")

    return GenerateKeyResponse(
        key_id=key_id,
        csr_pem=csr_pem,
        algorithm=req.algorithm,
        storage=storage,
    )
