"""Service Vault — stockage sécurisé des secrets PKI.

Vault est une dépendance **optionnelle**. Le démarrage de l'API ne doit donc
jamais en dépendre : aucun appel réseau n'est fait au démarrage, et toute
vérification de disponibilité est bornée dans le temps.
"""
import time

import hvac
import structlog

from app.config import settings

log = structlog.get_logger()

# Délai maximal accordé à Vault. Court volontairement : Vault est soit sur le
# même réseau Docker et répond en quelques millisecondes, soit absent.
_TIMEOUT_S = 2.0

# Durée de validité du résultat de disponibilité. Évite de payer un aller-retour
# réseau à chaque appel de /v1/capabilities.
_PROBE_TTL_S = 15.0

_client: hvac.Client | None = None
_available: bool = False
_last_probe: float = 0.0


class VaultService:

    @classmethod
    def connect(cls) -> None:
        """Prépare le client Vault. **Ne fait aucun appel réseau.**

        Appelée au démarrage de l'application : elle doit rendre la main
        immédiatement. Sonder Vault ici bloquerait la boucle d'événements et
        rendrait l'API indisponible tant que Vault ne répond pas.
        """
        global _client, _available, _last_probe

        _available = False
        _last_probe = 0.0

        if not settings.VAULT_ADDR:
            _client = None
            log.info("vault.disabled", reason="VAULT_ADDR non défini")
            return

        try:
            _client = hvac.Client(
                url=settings.VAULT_ADDR,
                token=settings.VAULT_TOKEN,
                timeout=_TIMEOUT_S,
            )
            log.info("vault.configured", addr=settings.VAULT_ADDR)
        except Exception as e:
            # URL malformée : on désactive Vault plutôt que d'empêcher
            # l'API de démarrer.
            _client = None
            log.warning("vault.bad_config", addr=settings.VAULT_ADDR, error=str(e))

    @classmethod
    def is_available(cls, force: bool = False) -> bool:
        """Indique si Vault répond. Résultat mis en cache pendant _PROBE_TTL_S."""
        global _available, _last_probe

        if _client is None:
            return False

        now = time.monotonic()
        if not force and (now - _last_probe) < _PROBE_TTL_S:
            return _available

        _last_probe = now
        try:
            _available = bool(_client.is_authenticated())
            if not _available:
                log.warning("vault.not_authenticated", addr=settings.VAULT_ADDR)
        except Exception as e:
            _available = False
            log.warning("vault.unreachable", addr=settings.VAULT_ADDR, error=str(e))

        return _available

    @classmethod
    def _require(cls) -> hvac.Client:
        if _client is None:
            raise RuntimeError(
                "Vault n'est pas configuré sur cette installation. "
                "Utilisez le stockage local, ou définissez VAULT_ADDR."
            )
        if not cls.is_available():
            raise RuntimeError(
                "Vault est configuré mais injoignable. Démarrez-le avec "
                "« docker compose --profile vault up -d vault », ou utilisez "
                "le stockage local."
            )
        return _client

    @classmethod
    def write_secret(cls, path: str, data: dict) -> None:
        cls._require().secrets.kv.v2.create_or_update_secret(
            path=path,
            secret=data,
            mount_point=settings.VAULT_MOUNT_PATH,
        )

    @classmethod
    def read_secret(cls, path: str) -> dict:
        resp = cls._require().secrets.kv.v2.read_secret_version(
            path=path,
            mount_point=settings.VAULT_MOUNT_PATH,
        )
        return resp["data"]["data"]

    @classmethod
    def delete_secret(cls, path: str) -> None:
        cls._require().secrets.kv.v2.delete_metadata_and_all_versions(
            path=path,
            mount_point=settings.VAULT_MOUNT_PATH,
        )
