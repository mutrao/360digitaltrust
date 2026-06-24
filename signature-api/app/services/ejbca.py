"""Client EJBCA REST API v1
Documentation : https://doc.primekey.com/ejbca/ejbca-operations/ejbca-ca-concept-guide/ejbca-rest-interface
"""
import base64
from typing import Optional
import httpx
import structlog

from app.config import settings

log = structlog.get_logger()


class EJBCAClient:
    """Client pour l'API REST EJBCA CE v1."""

    def __init__(self):
        self.base_url = settings.EJBCA_REST_URL
        self.verify_ssl = settings.CA_VERIFY_SSL
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                verify=self.verify_ssl,
                timeout=30.0,
                headers={"Content-Type": "application/json"},
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ----------------------------------------------------------
    # Émission de certificat à partir d'un CSR (PKCS#10)
    # ----------------------------------------------------------
    async def issue_certificate(
        self,
        ca_name: str,
        cert_profile: str,
        end_entity_profile: str,
        csr_pem: str,
        subject_dn: str,
        username: str,
        password: str = "foo123",
    ) -> dict:
        client = await self._get_client()

        # Encoder le CSR en base64 (sans en-têtes PEM)
        csr_b64 = base64.b64encode(
            _pem_to_der(csr_pem)
        ).decode()

        payload = {
            "certificate_request": csr_pem,
            "certificate_profile_name": cert_profile,
            "end_entity_profile_name": end_entity_profile,
            "certificate_authority_name": ca_name,
            "username": username,
            "password": password,
            "include_chain": True,
        }

        log.info("ejbca.issue_certificate", ca=ca_name, profile=cert_profile, dn=subject_dn)
        resp = await client.post("/certificate/pkcs10enroll", json=payload)
        resp.raise_for_status()
        return resp.json()

    # ----------------------------------------------------------
    # Révocation d'un certificat
    # ----------------------------------------------------------
    async def revoke_certificate(
        self,
        issuer_dn: str,
        serial_hex: str,
        reason: str = "UNSPECIFIED",
    ) -> dict:
        client = await self._get_client()
        resp = await client.put(
            f"/certificate/{issuer_dn}/{serial_hex}/revoke",
            json={"reason": reason, "date": None},
        )
        resp.raise_for_status()
        return resp.json()

    # ----------------------------------------------------------
    # Statut d'un certificat
    # ----------------------------------------------------------
    async def get_certificate_status(
        self,
        issuer_dn: str,
        serial_hex: str,
    ) -> dict:
        client = await self._get_client()
        resp = await client.get(f"/certificate/{issuer_dn}/{serial_hex}/status")
        resp.raise_for_status()
        return resp.json()

    # ----------------------------------------------------------
    # Liste des CA disponibles
    # ----------------------------------------------------------
    async def list_cas(self) -> list:
        client = await self._get_client()
        resp = await client.get("/ca")
        resp.raise_for_status()
        return resp.json().get("certificate_authorities", [])

    # ----------------------------------------------------------
    # Téléchargement du certificat CA
    # ----------------------------------------------------------
    async def get_ca_certificate(self, ca_name: str) -> bytes:
        client = await self._get_client()
        resp = await client.get(f"/ca/{ca_name}/certificate/download")
        resp.raise_for_status()
        return resp.content


def _pem_to_der(pem: str) -> bytes:
    """Convertit un PEM en DER (retire les en-têtes)."""
    lines = pem.strip().splitlines()
    b64 = "".join(
        line for line in lines
        if not line.startswith("-----")
    )
    return base64.b64decode(b64)


# Singleton
ejbca_client = EJBCAClient()
