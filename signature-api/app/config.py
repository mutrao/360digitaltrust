from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    ENV: str = "development"
    SECRET_KEY: str = "changeme"

    # EJBCA REST API
    EJBCA_REST_URL: str = "https://pki-ca:8443/ejbca/ejbca-rest-api/v1"
    EJBCA_ADMIN_PASSWORD: str = "changeme_admin_2026!"
    CA_VERIFY_SSL: bool = False

    # Noms des CA
    CA_ROOT_NAME: str = "360DT-Root-CA"
    CA_SUB_SIGN_NAME: str = "360DT-Sub-Signature-CA"
    CA_SUB_TSA_NAME: str = "360DT-Sub-TSA-CA"
    CA_SUB_OCSP_NAME: str = "360DT-Sub-OCSP-CA"

    # Redis
    REDIS_URL: str = "redis://cache:6379/0"

    # Vault
    VAULT_ADDR: str = "http://vault:8210"
    VAULT_TOKEN: str = "root-dev-token-2026"
    VAULT_MOUNT_PATH: str = "secret"

    # URLs publiques PKI
    CRL_BASE_URL: str = "http://crl.localhost/crl"
    OCSP_URL: str = "http://pki-ca:8009/ejbca/publicweb/status/ocsp"

    # CORS
    CORS_ORIGINS: List[str] = ["*"]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
