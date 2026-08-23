"""Audit trail — traçabilité complète des opérations de signature."""
from typing import Optional
from fastapi import APIRouter, HTTPException
import structlog

from app.services.audit_store import AuditStore

log = structlog.get_logger()
router = APIRouter()


@router.get("/logs", summary="Consulter les logs d'audit")
async def get_audit_logs(
    limit: int = 100,
    event_type: Optional[str] = None,
    signer_id: Optional[str] = None,
):
    """
    Retourne les événements d'audit triés par date décroissante.
    Filtrables par type d'événement et par signataire.
    """
    logs = await AuditStore.get_all(limit=limit)
    if event_type:
        logs = [l for l in logs if l.get("event") == event_type]
    if signer_id:
        logs = [l for l in logs if l.get("signer_id") == signer_id]
    return {"logs": logs, "total": len(logs)}


@router.get("/logs/{signature_id}", summary="Détail d'une signature")
async def get_audit_entry(signature_id: str):
    logs = await AuditStore.get_all(limit=10000)
    entry = next((l for l in logs if l.get("signature_id") == signature_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail="Entrée d'audit introuvable")
    return entry


@router.get("/stats", summary="Statistiques de signature")
async def get_audit_stats():
    logs = await AuditStore.get_all(limit=10000)
    stats = {
        "total_signatures": sum(1 for l in logs if l.get("event") in
                                ["sign_hash", "sign_pdf", "sign_xml", "sign_cms"]),
        "total_workflows": sum(1 for l in logs if l.get("event") == "workflow_created"),
        "total_events": len(logs),
        "by_event": {},
        "by_algorithm": {},
    }
    for entry in logs:
        ev = entry.get("event", "unknown")
        stats["by_event"][ev] = stats["by_event"].get(ev, 0) + 1
        alg = entry.get("hash_algorithm")
        if alg:
            stats["by_algorithm"][alg] = stats["by_algorithm"].get(alg, 0) + 1
    return stats
