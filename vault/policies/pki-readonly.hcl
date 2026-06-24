# Politique Vault — Accès lecture seule (auditeur)
path "secret/data/pki/ca-certs/*" {
  capabilities = ["read", "list"]
}

path "*" {
  capabilities = ["deny"]
}
