"""Service Vault — stockage sécurisé des secrets PKI."""
import hvac
import structlog

from app.config import settings

log = structlog.get_logger()
_vault: hvac.Client | None = None


class VaultService:

    @classmethod
    def connect(cls):
        global _vault
        _vault = hvac.Client(
            url=settings.VAULT_ADDR,
            token=settings.VAULT_TOKEN,
        )
        if _vault.is_authenticated():
            log.info("vault.connected", addr=settings.VAULT_ADDR)
        else:
            log.warning("vault.not_authenticated")

    @classmethod
    def write_secret(cls, path: str, data: dict):
        if _vault is None:
            raise RuntimeError("Vault non connecté")
        _vault.secrets.kv.v2.create_or_update_secret(
            path=path,
            secret=data,
            mount_point=settings.VAULT_MOUNT_PATH,
        )

    @classmethod
    def read_secret(cls, path: str) -> dict:
        if _vault is None:
            raise RuntimeError("Vault non connecté")
        resp = _vault.secrets.kv.v2.read_secret_version(
            path=path,
            mount_point=settings.VAULT_MOUNT_PATH,
        )
        return resp["data"]["data"]

    @classmethod
    def delete_secret(cls, path: str):
        if _vault is None:
            raise RuntimeError("Vault non connecté")
        _vault.secrets.kv.v2.delete_metadata_and_all_versions(
            path=path,
            mount_point=settings.VAULT_MOUNT_PATH,
        )
