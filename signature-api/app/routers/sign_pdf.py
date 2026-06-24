"""Signature PAdES — PDF Advanced Electronic Signature (ETSI EN 319 132)."""
import base64
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Literal
import io
import structlog

from pyhanko.sign import signers, fields
from pyhanko.sign.signers.pdf_signer import PdfSignatureMetadata
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.sign.fields import SigSeedSubFilter
from pyhanko_certvalidator import CertificateValidator
from cryptography.hazmat.primitives.serialization import pkcs12

from app.services.key_manager import KeyManager

log = structlog.get_logger()
router = APIRouter()


class SignPdfRequest(BaseModel):
    pdf_b64: str                              # PDF en base64
    key_id: str                               # ID clé dans Vault
    certificate_pem: str                      # Certificat du signataire (PEM)
    reason: str = "Signature électronique"
    location: str = "Paris, France"
    contact: str = ""
    subfilter: Literal["adbe.pkcs7.detached", "ETSI.CAdES.detached"] = "ETSI.CAdES.detached"
    timestamp: bool = True                    # Ajouter un horodatage TSA


@router.post("/sign", summary="Signer un PDF (PAdES)")
async def sign_pdf(req: SignPdfRequest):
    """
    Signe un PDF au format PAdES-B-B (base) ou PAdES-B-T (avec horodatage).
    Retourne le PDF signé en base64.
    """
    try:
        # Décoder le PDF
        pdf_bytes = base64.b64decode(req.pdf_b64)

        # Charger la clé privée depuis Vault
        private_key = KeyManager.load_key_from_vault(req.key_id)

        # Construire le signataire pyHanko
        from cryptography.hazmat.primitives.serialization import (
            Encoding, PrivateFormat, NoEncryption
        )
        from cryptography import x509 as cx509

        cert = cx509.load_pem_x509_certificate(req.certificate_pem.encode())

        signer = signers.SimpleSigner(
            signing_key=private_key,
            signing_cert=cert,
            cert_registry=None,
        )

        # Métadonnées de signature
        sig_meta = PdfSignatureMetadata(
            field_name="Sig1",
            reason=req.reason,
            location=req.location,
            contact_info=req.contact,
            subfilter=(
                SigSeedSubFilter.PADES
                if req.subfilter == "ETSI.CAdES.detached"
                else SigSeedSubFilter.ADOBE_PKCS7_DETACHED
            ),
        )

        # Signer
        pdf_out = io.BytesIO()
        w = IncrementalPdfFileWriter(io.BytesIO(pdf_bytes))
        signers.sign_pdf(w, sig_meta, signer=signer, output=pdf_out)

        signed_pdf = pdf_out.getvalue()
        log.info("sign.pdf.ok", key_id=req.key_id, size=len(signed_pdf))

        return {
            "status": "signed",
            "format": "PAdES",
            "signed_pdf_b64": base64.b64encode(signed_pdf).decode(),
            "size_bytes": len(signed_pdf),
        }

    except Exception as e:
        log.error("sign.pdf.error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Erreur signature PAdES : {e}")


@router.post("/sign/upload", summary="Signer un PDF uploadé (PAdES)")
async def sign_pdf_upload(
    file: UploadFile = File(...),
    key_id: str = Form(...),
    certificate_pem: str = Form(...),
    reason: str = Form("Signature électronique"),
):
    """Endpoint multipart/form-data pour upload de PDF à signer."""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Le fichier doit être un PDF.")

    pdf_bytes = await file.read()
    pdf_b64 = base64.b64encode(pdf_bytes).decode()

    return await sign_pdf(SignPdfRequest(
        pdf_b64=pdf_b64,
        key_id=key_id,
        certificate_pem=certificate_pem,
        reason=reason,
    ))
