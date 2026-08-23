"""360DigitalTrust — Signature API
Microservice de signature électronique : PAdES / XAdES / CAdES / TSA / Hash-only
"""
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.config import settings
from app.routers import (
    certificates, sign_pdf, sign_xml, sign_cms,
    sign_hash, ocsp, tsa, keys, workflows, audit, users
)
from app.services.cache import CacheService
from app.services.vault import VaultService

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("startup", service="signature-api", env=settings.ENV)
    await CacheService.connect()
    try:
        VaultService.connect()
    except Exception as e:
        log.warning("vault.disabled", reason=str(e))
    yield
    await CacheService.disconnect()
    log.info("shutdown", service="signature-api")


app = FastAPI(
    title="360DigitalTrust — Signature API",
    description=(
        "Microservice de signature électronique conforme eIDAS.\n\n"
        "Formats : **PAdES** (PDF), **XAdES** (XML), **CAdES** (CMS), **Hash-only** (confidentialité).\n"
        "Services : clés, certificats, workflows, OCSP, TSA, audit."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# Routeurs
app.include_router(keys.router,         prefix="/v1/keys",         tags=["Clés"])
app.include_router(certificates.router, prefix="/v1/certificates", tags=["Certificats"])
app.include_router(sign_hash.router,    prefix="/v1/sign/hash",    tags=["Signature Hash (privé)"])
app.include_router(sign_pdf.router,     prefix="/v1/sign/pdf",     tags=["Signature PAdES"])
app.include_router(sign_xml.router,     prefix="/v1/sign/xml",     tags=["Signature XAdES"])
app.include_router(sign_cms.router,     prefix="/v1/sign/cms",     tags=["Signature CAdES"])
app.include_router(workflows.router,    prefix="/v1/workflows",    tags=["Workflows"])
app.include_router(audit.router,        prefix="/v1/audit",        tags=["Audit"])
app.include_router(users.router,        prefix="/v1/users",        tags=["Utilisateurs"])
app.include_router(ocsp.router,         prefix="/v1/ocsp",         tags=["OCSP"])
app.include_router(tsa.router,          prefix="/v1/tsa",          tags=["TSA"])


@app.get("/health", tags=["Santé"])
async def health():
    return {"status": "ok", "service": "signature-api", "version": "2.0.0"}


@app.get("/", tags=["Santé"])
async def root():
    return {
        "service": "360DigitalTrust Signature API",
        "version": "2.0.0",
        "docs": "/docs",
        "features": ["hash-signing", "PAdES", "XAdES", "CAdES", "workflows", "audit", "TSA", "OCSP"],
    }
