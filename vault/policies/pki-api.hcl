# Politique Vault — Signature API
# Accès en lecture/écriture sur les secrets PKI uniquement

# Clés privées des signataires
path "secret/data/pki/keys/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Credentials EJBCA
path "secret/data/pki/ejbca/*" {
  capabilities = ["read"]
}

# Certificats CA publics
path "secret/data/pki/ca-certs/*" {
  capabilities = ["read", "list"]
}

# Interdire l'accès à tout le reste
path "*" {
  capabilities = ["deny"]
}
