"""Workflows de signature multi-étapes.

Supporte :
- Séquentiel : signataire 1 signe, puis signataire 2, etc.
- Parallèle : tous signent indépendamment, ordre libre
- Mixte : groupes parallèles en séquence
"""
import uuid
from datetime import datetime, timezone
from typing import Literal, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import structlog

from app.services.workflow_store import WorkflowStore
from app.services.audit_store import AuditStore

log = structlog.get_logger()
router = APIRouter()


class WorkflowSigner(BaseModel):
    user_id: str
    name: str
    email: str
    order: int = 1                         # Ordre de signature (séquentiel)
    required: bool = True


class CreateWorkflowRequest(BaseModel):
    title: str
    document_name: str
    document_hash_b64: str                 # Hash du document — jamais le fichier
    hash_algorithm: str = "sha256"
    signers: List[WorkflowSigner]
    mode: Literal["sequential", "parallel", "mixed"] = "sequential"
    expires_at: Optional[str] = None       # ISO 8601
    message: str = ""                      # Message aux signataires
    created_by: str = "admin"


class WorkflowStepSignRequest(BaseModel):
    workflow_id: str
    signer_id: str
    key_id: str
    certificate_pem: str


@router.post("/create", summary="Créer un workflow de signature")
async def create_workflow(req: CreateWorkflowRequest):
    """Crée un workflow de signature multi-étapes."""
    wf_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    workflow = {
        "id": wf_id,
        "title": req.title,
        "document_name": req.document_name,
        "document_hash_b64": req.document_hash_b64,
        "hash_algorithm": req.hash_algorithm,
        "mode": req.mode,
        "status": "pending",
        "created_by": req.created_by,
        "created_at": now,
        "expires_at": req.expires_at,
        "message": req.message,
        "signers": [
            {
                **s.model_dump(),
                "status": "pending",
                "signed_at": None,
                "signature_id": None,
            }
            for s in req.signers
        ],
        "signatures": [],
    }

    await WorkflowStore.save(wf_id, workflow)
    await AuditStore.log({
        "event": "workflow_created",
        "workflow_id": wf_id,
        "title": req.title,
        "mode": req.mode,
        "signers": [s.user_id for s in req.signers],
        "created_by": req.created_by,
        "created_at": now,
    })

    log.info("workflow.created", wf_id=wf_id, mode=req.mode,
             signers=len(req.signers))
    return {"workflow_id": wf_id, "status": "pending", "created_at": now}


@router.post("/sign-step", summary="Signer une étape du workflow")
async def sign_workflow_step(req: WorkflowStepSignRequest):
    """Un signataire signe sa partie du workflow."""
    workflow = await WorkflowStore.get(req.workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow introuvable")
    if workflow["status"] == "completed":
        raise HTTPException(status_code=400, detail="Workflow déjà complété")

    # Vérifier que le signataire est attendu
    signer_entry = next(
        (s for s in workflow["signers"] if s["user_id"] == req.signer_id), None
    )
    if not signer_entry:
        raise HTTPException(status_code=403, detail="Signataire non autorisé")
    if signer_entry["status"] == "signed":
        raise HTTPException(status_code=400, detail="Déjà signé")

    # En mode séquentiel, vérifier l'ordre
    if workflow["mode"] == "sequential":
        current_order = signer_entry["order"]
        for s in workflow["signers"]:
            if s["order"] < current_order and s["status"] != "signed":
                raise HTTPException(
                    status_code=400,
                    detail=f"En attente de la signature de l'ordre {s['order']}"
                )

    # Signer le hash via le routeur sign_hash
    from app.routers.sign_hash import sign_hash, SignHashRequest
    sig_result = await sign_hash(SignHashRequest(
        key_id=req.key_id,
        certificate_pem=req.certificate_pem,
        document_hash_b64=workflow["document_hash_b64"],
        hash_algorithm=workflow["hash_algorithm"],
        document_name=workflow["document_name"],
        signer_id=req.signer_id,
    ))

    # Mettre à jour le workflow
    now = datetime.now(timezone.utc).isoformat()
    for s in workflow["signers"]:
        if s["user_id"] == req.signer_id:
            s["status"] = "signed"
            s["signed_at"] = now
            s["signature_id"] = sig_result.signature_id

    workflow["signatures"].append({
        "signer_id": req.signer_id,
        "signature_id": sig_result.signature_id,
        "signature_b64": sig_result.signature_b64,
        "signed_at": now,
    })

    # Vérifier si le workflow est complet
    required_signers = [s for s in workflow["signers"] if s["required"]]
    if all(s["status"] == "signed" for s in required_signers):
        workflow["status"] = "completed"
        workflow["completed_at"] = now

    await WorkflowStore.save(req.workflow_id, workflow)
    log.info("workflow.step_signed", wf_id=req.workflow_id,
             signer=req.signer_id, status=workflow["status"])

    return {
        "workflow_id": req.workflow_id,
        "workflow_status": workflow["status"],
        "signature_id": sig_result.signature_id,
        "signed_at": now,
    }


@router.get("/{workflow_id}", summary="Statut d'un workflow")
async def get_workflow(workflow_id: str):
    workflow = await WorkflowStore.get(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow introuvable")
    return workflow


@router.get("/", summary="Liste des workflows")
async def list_workflows(status: Optional[str] = None, limit: int = 50):
    workflows = await WorkflowStore.list_all(limit=limit)
    if status:
        workflows = [w for w in workflows if w.get("status") == status]
    return {"workflows": workflows, "total": len(workflows)}


@router.delete("/{workflow_id}", summary="Annuler un workflow")
async def cancel_workflow(workflow_id: str, cancelled_by: str = "admin"):
    workflow = await WorkflowStore.get(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow introuvable")
    if workflow["status"] == "completed":
        raise HTTPException(status_code=400, detail="Impossible d'annuler un workflow complété")
    workflow["status"] = "cancelled"
    workflow["cancelled_at"] = datetime.now(timezone.utc).isoformat()
    workflow["cancelled_by"] = cancelled_by
    await WorkflowStore.save(workflow_id, workflow)
    await AuditStore.log({"event": "workflow_cancelled", "workflow_id": workflow_id,
                          "cancelled_by": cancelled_by})
    return {"status": "cancelled"}
