"""Gestionnaire de clés : génération, stockage fichier local ou Vault, CSR."""
import base64
import os
import json
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, ec
from cryptography.x509.oid import NameOID
import structlog

log = structlog.get_logger()

# Stockage local des clés quand Vault n'est pas disponible
LOCAL_KEY_STORE = Path("/tmp/pki-keys")
LOCAL_KEY_STORE.mkdir(parents=True, exist_ok=True)


class KeyManager:

    @staticmethod
    def generate_rsa_key(key_size: int = 2048) -> rsa.RSAPrivateKey:
        return rsa.generate_private_key(
            public_exponent=65537,
            key_size=key_size,
        )

    @staticmethod
    def generate_ec_key(curve: str = "P-256") -> ec.EllipticCurvePrivateKey:
        curves = {"P-256": ec.SECP256R1(), "P-384": ec.SECP384R1()}
        return ec.generate_private_key(curves.get(curve, ec.SECP256R1()))

    @staticmethod
    def key_to_pem(private_key, password: bytes | None = None) -> bytes:
        enc = (
            serialization.BestAvailableEncryption(password)
            if password
            else serialization.NoEncryption()
        )
        return private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=enc,
        )

    @staticmethod
    def build_csr(
        private_key,
        common_name: str,
        organization: str = "360DigitalTrust",
        country: str = "FR",
        email: str | None = None,
    ) -> str:
        builder = x509.CertificateSigningRequestBuilder()
        name_attrs = [
            x509.NameAttribute(NameOID.COMMON_NAME, common_name),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, organization),
            x509.NameAttribute(NameOID.COUNTRY_NAME, country),
        ]
        if email:
            name_attrs.append(x509.NameAttribute(NameOID.EMAIL_ADDRESS, email))
        builder = builder.subject_name(x509.Name(name_attrs))
        csr = builder.sign(private_key, hashes.SHA256())
        return csr.public_bytes(serialization.Encoding.PEM).decode()

    @classmethod
    def store_key(cls, key_id: str, private_key, use_vault: bool = False):
        """Stocke la clé dans Vault si disponible, sinon en fichier local."""
        pem = cls.key_to_pem(private_key)
        pem_b64 = base64.b64encode(pem).decode()

        if use_vault:
            try:
                from app.services.vault import VaultService
                VaultService.write_secret(
                    path=f"pki/keys/{key_id}",
                    data={"private_key_pem": pem_b64},
                )
                log.info("key.stored.vault", key_id=key_id)
                return
            except Exception as e:
                log.warning("key.vault_unavailable", error=str(e), fallback="local")

        # Fallback : stockage fichier local
        key_file = LOCAL_KEY_STORE / f"{key_id}.json"
        key_file.write_text(json.dumps({"private_key_pem": pem_b64}))
        log.info("key.stored.local", key_id=key_id, path=str(key_file))

    @classmethod
    def load_key(cls, key_id: str):
        """Charge une clé depuis Vault ou le stockage local."""
        # Essayer Vault d'abord
        try:
            from app.services.vault import VaultService
            data = VaultService.read_secret(path=f"pki/keys/{key_id}")
            pem = base64.b64decode(data["private_key_pem"])
            return serialization.load_pem_private_key(pem, password=None)
        except Exception:
            pass

        # Fallback : stockage local
        key_file = LOCAL_KEY_STORE / f"{key_id}.json"
        if not key_file.exists():
            raise FileNotFoundError(f"Clé introuvable : {key_id}")
        data = json.loads(key_file.read_text())
        pem = base64.b64decode(data["private_key_pem"])
        return serialization.load_pem_private_key(pem, password=None)

    # Aliases pour compatibilité
    @classmethod
    def store_key_in_vault(cls, key_id: str, private_key, passphrase=None):
        cls.store_key(key_id, private_key, use_vault=True)

    @classmethod
    def load_key_from_vault(cls, key_id: str, passphrase=None):
        return cls.load_key(key_id)
