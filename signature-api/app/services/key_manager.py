"""Gestionnaire de clés : génération, stockage Vault, CSR."""
import base64
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, ec
from cryptography.x509.oid import NameOID
import structlog

from app.services.vault import VaultService

log = structlog.get_logger()


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
    def store_key_in_vault(cls, key_id: str, private_key, passphrase: bytes | None = None):
        """Stocke la clé privée chiffrée dans Vault."""
        pem = cls.key_to_pem(private_key, passphrase)
        VaultService.write_secret(
            path=f"pki/keys/{key_id}",
            data={
                "private_key_pem": base64.b64encode(pem).decode(),
                "protected": passphrase is not None,
            },
        )
        log.info("key.stored", key_id=key_id)

    @classmethod
    def load_key_from_vault(cls, key_id: str, passphrase: bytes | None = None):
        """Charge une clé privée depuis Vault."""
        data = VaultService.read_secret(path=f"pki/keys/{key_id}")
        pem = base64.b64decode(data["private_key_pem"])
        return serialization.load_pem_private_key(pem, password=passphrase)
