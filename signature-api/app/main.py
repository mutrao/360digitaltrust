"""360DigitalTrust — Signature API
Microservice de signature électronique : PAdES / XAdES / CAdES / TSA
"""
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.config import settings
from app.routers import (
    certificates, sign_pdf, sign_xml, sign_cms, ocsp, tsa, keys,
    sign_hash, workflows, audit, users,
)
from app.services.cache import CacheService
from app.services.vault import VaultService

log = structlog.get_logger()

API_VERSION = "2.0.0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("startup", service="signature-api", env=settings.ENV)
    await CacheService.connect()
    VaultService.connect()
    yield
    await CacheService.disconnect()
    log.info("shutdown", service="signature-api")


app = FastAPI(
    title="360DigitalTrust — Signature API",
    description=(
        "Microservice de signature électronique conforme eIDAS.\n\n"
        "Formats : **PAdES** (PDF), **XAdES** (XML), **CAdES** (CMS).\n"
        "Services : émission certificats, OCSP, TSA RFC 3161."
    ),
    version=API_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS (restreindre en production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Métriques Prometheus
Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# Routeurs
app.include_router(certificates.router, prefix="/v1/certificates", tags=["Certificats"])
app.include_router(keys.router,         prefix="/v1/keys",         tags=["Clés"])
app.include_router(sign_pdf.router,     prefix="/v1/sign/pdf",     tags=["Signature PAdES"])
app.include_router(sign_xml.router,     prefix="/v1/sign/xml",     tags=["Signature XAdES"])
app.include_router(sign_cms.router,     prefix="/v1/sign/cms",     tags=["Signature CAdES"])
app.include_router(sign_hash.router,    prefix="/v1/sign/hash",    tags=["Signature hash-only"])
app.include_router(ocsp.router,         prefix="/v1/ocsp",         tags=["OCSP"])
app.include_router(tsa.router,          prefix="/v1/tsa",          tags=["Horodatage TSA"])
app.include_router(workflows.router,    prefix="/v1/workflows",    tags=["Workflows"])
app.include_router(audit.router,        prefix="/v1/audit",        tags=["Audit"])
app.include_router(users.router,        prefix="/v1/users",        tags=["Utilisateurs"])


@app.get("/health", tags=["Santé"])
async def health():
    return {"status": "ok", "service": "signature-api", "version": API_VERSION}


@app.get("/v1/health", tags=["Santé"])
async def health_v1():
    """Alias versionné — utilisé par le frontend pour le diagnostic."""
    return {"status": "ok", "service": "signature-api", "version": API_VERSION}


@app.get("/v1/capabilities", tags=["Santé"])
async def capabilities():
    """Capacités réellement exposées par ce backend.

    Le frontend s'appuie dessus pour n'afficher que les fonctionnalités
    disponibles, plutôt que de présenter des écrans inertes.
    """
    from app.services.vault import VaultService

    return {
        "version": API_VERSION,
        "features": {
            "hash_signing": True,
            "pdf_signing": True,
            "xml_signing": True,
            "cms_signing": True,
            "workflows": True,
            "audit_trail": True,
            "users": True,
            "key_generation": True,
            "certificate_issuance": True,
            "ocsp": True,
            "timestamping": True,
            # Non implémentés côté backend — voir docs/BACKEND_INTEGRATION.md
            "document_storage": False,
            "email_notifications": False,
            "templates": False,
            "pdf_field_placement": False,
            "authentication": False,
        },
        "storage": {
            "vault_available": VaultService.is_available(),
            "local_keys": True,
        },
    }


@app.get("/", tags=["Santé"])
async def root():
    return {
        "service": "360DigitalTrust Signature API",
        "version": API_VERSION,
        "docs": "/docs",
    }
