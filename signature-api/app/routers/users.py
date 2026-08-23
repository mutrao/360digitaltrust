"""Gestion des utilisateurs signataires."""
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
import structlog

from app.services.user_store import UserStore

log = structlog.get_logger()
router = APIRouter()


class CreateUserRequest(BaseModel):
    name: str
    email: str
    role: str = "signer"          # signer | admin | auditor
    organization: str = ""


@router.post("/", summary="Créer un utilisateur")
async def create_user(req: CreateUserRequest):
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    user = {
        "id": user_id,
        "name": req.name,
        "email": req.email,
        "role": req.role,
        "organization": req.organization,
        "created_at": now,
        "status": "active",
        "key_id": None,
        "certificate_pem": None,
    }
    await UserStore.save(user_id, user)
    log.info("user.created", user_id=user_id, email=req.email)
    return user


@router.get("/", summary="Liste des utilisateurs")
async def list_users(role: Optional[str] = None):
    users = await UserStore.list_all()
    if role:
        users = [u for u in users if u.get("role") == role]
    return {"users": users, "total": len(users)}


@router.get("/{user_id}", summary="Détail d'un utilisateur")
async def get_user(user_id: str):
    user = await UserStore.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return user


@router.put("/{user_id}/certificate", summary="Associer un certificat à un utilisateur")
async def set_user_certificate(user_id: str, key_id: str, certificate_pem: str):
    user = await UserStore.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    user["key_id"] = key_id
    user["certificate_pem"] = certificate_pem
    await UserStore.save(user_id, user)
    return {"status": "updated", "user_id": user_id}


@router.delete("/{user_id}", summary="Désactiver un utilisateur")
async def deactivate_user(user_id: str):
    user = await UserStore.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    user["status"] = "inactive"
    await UserStore.save(user_id, user)
    return {"status": "deactivated"}
