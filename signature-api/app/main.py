"""360DigitalTrust — Signature API
Microservice de signature électronique : PAdES / XAdES / CAdES / TSA
"""
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.config import settings
from app.routers import certificates, sign_pdf, sign_xml, sign_cms, ocsp, tsa, keys
from app.services.cache import CacheService
from app.services.vault import VaultService

log = structlog.get_logger()


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
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS (restreindre en production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["GET", "POST"],
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
app.include_router(ocsp.router,         prefix="/v1/ocsp",         tags=["OCSP"])
app.include_router(tsa.router,          prefix="/v1/tsa",          tags=["Horodatage TSA"])


@app.get("/health", tags=["Santé"])
async def health():
    return {"status": "ok", "service": "signature-api", "version": "1.0.0"}


@app.get("/", tags=["Santé"])
async def root():
    return {
        "service": "360DigitalTrust Signature API",
        "version": "1.0.0",
        "docs": "/docs",
    }
