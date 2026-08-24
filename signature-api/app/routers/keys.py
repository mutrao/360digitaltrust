"""API de gestion des clés cryptographiques."""
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal

from app.services.key_manager import KeyManager
from app.services.vault import VaultService

router = APIRouter()


class GenerateKeyRequest(BaseModel):
    algorithm: Literal["RSA", "EC"] = "RSA"
    key_size: int = 2048          # RSA
    curve: str = "P-256"          # EC
    common_name: str
    organization: str = "360DigitalTrust"
    country: str = "FR"
    email: str | None = None
    store_in_vault: bool = False  # False = stockage local sur volume


class GenerateKeyResponse(BaseModel):
    key_id: str
    csr_pem: str
    algorithm: str
    storage: str                  # "vault" | "local"


@router.post("/generate", response_model=GenerateKeyResponse,
             summary="Générer une paire de clés")
async def generate_key(req: GenerateKeyRequest):
    """
    Génère une paire de clés RSA ou EC et retourne un CSR PKCS#10.

    La clé privée est persistée soit dans Vault (`store_in_vault=true`),
    soit sur le volume local de l'API. Elle n'est jamais retournée au client.
    """
    key_id = str(uuid.uuid4())

    if req.algorithm == "RSA":
        if req.key_size not in (2048, 3072, 4096):
            raise HTTPException(status_code=400,
                                detail="key_size doit être 2048, 3072 ou 4096")
        private_key = KeyManager.generate_rsa_key(req.key_size)
    else:
        if req.curve not in ("P-256", "P-384", "P-521"):
            raise HTTPException(status_code=400,
                                detail="curve doit être P-256, P-384 ou P-521")
        private_key = KeyManager.generate_ec_key(req.curve)

    csr_pem = KeyManager.build_csr(
        private_key,
        common_name=req.common_name,
        organization=req.organization,
        country=req.country,
        email=req.email,
    )

    if req.store_in_vault and not VaultService.is_available():
        raise HTTPException(
            status_code=503,
            detail=(
                "Vault n'est pas disponible. Démarrez-le avec "
                "« docker compose --profile vault up -d vault » puis "
                "« docker compose restart signature-api », ou choisissez "
                "le stockage local."
            ),
        )

    try:
        storage = KeyManager.store_key(key_id, private_key, use_vault=req.store_in_vault)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Stockage de la clé impossible : {e}")

    return GenerateKeyResponse(
        key_id=key_id,
        csr_pem=csr_pem,
        algorithm=req.algorithm,
        storage=storage,
    )


@router.get("/storage-backends", summary="Backends de stockage disponibles")
async def storage_backends():
    """Indique au client quels modes de stockage il peut proposer."""
    return {
        "local": {"available": True, "label": "Stockage local (volume API)"},
        "vault": {
            "available": VaultService.is_available(),
            "label": "HashiCorp Vault",
        },
    }
