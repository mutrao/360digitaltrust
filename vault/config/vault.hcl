# HashiCorp Vault — Configuration
# Mode développement local
# En production : backend Raft ou Consul, TLS obligatoire

storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true   # TLS activé en production
}

api_addr = "http://0.0.0.0:8200"
ui = true

# Logs
log_level = "info"
log_format = "json"
