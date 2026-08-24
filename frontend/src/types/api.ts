/**
 * Types alignés sur les modèles Pydantic du backend.
 * Source de vérité : signature-api/app/routers/*.py
 * Ne rien ajouter ici qui n'existe pas côté serveur.
 */

// ── Capacités ────────────────────────────────────────────────────

export interface Capabilities {
  version: string;
  features: {
    hash_signing: boolean;
    pdf_signing: boolean;
    xml_signing: boolean;
    cms_signing: boolean;
    workflows: boolean;
    audit_trail: boolean;
    users: boolean;
    key_generation: boolean;
    certificate_issuance: boolean;
    ocsp: boolean;
    timestamping: boolean;
    document_storage: boolean;
    email_notifications: boolean;
    templates: boolean;
    pdf_field_placement: boolean;
    authentication: boolean;
  };
  storage: { vault_available: boolean; local_keys: boolean };
}

export type FeatureName = keyof Capabilities['features'];

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

// ── Clés ─────────────────────────────────────────────────────────

export type KeyAlgorithm = 'RSA' | 'EC';
export type RsaKeySize = 2048 | 3072 | 4096;
export type EcCurve = 'P-256' | 'P-384' | 'P-521';
export type StorageBackend = 'local' | 'vault';

export interface GenerateKeyRequest {
  algorithm: KeyAlgorithm;
  key_size?: RsaKeySize;
  curve?: EcCurve;
  common_name: string;
  organization?: string;
  country?: string;
  email?: string | null;
  store_in_vault: boolean;
}

export interface GenerateKeyResponse {
  key_id: string;
  csr_pem: string;
  algorithm: KeyAlgorithm;
  storage: StorageBackend;
}

export interface StorageBackendsResponse {
  local: { available: boolean; label: string };
  vault: { available: boolean; label: string };
}

// ── Signature hash-only ──────────────────────────────────────────

export type HashAlgorithm = 'sha256' | 'sha384' | 'sha512';

export interface SignHashRequest {
  key_id: string;
  certificate_pem: string;
  document_hash_b64: string;
  hash_algorithm: HashAlgorithm;
  document_name: string;
  document_mime: string;
  signer_id: string;
}

export interface SignHashResponse {
  signature_id: string;
  signature_b64: string;
  signed_at: string;
  hash_algorithm: HashAlgorithm;
  document_hash_b64: string;
  certificate_subject: string;
}

// ── Workflows ────────────────────────────────────────────────────

export type WorkflowMode = 'sequential' | 'parallel' | 'mixed';

/** Statuts réellement produits par le backend. Ne pas en inventer d'autres. */
export type WorkflowStatus = 'pending' | 'completed' | 'cancelled';
export type SignerStatus = 'pending' | 'signed';

export interface WorkflowSignerInput {
  user_id: string;
  name: string;
  email: string;
  order: number;
  required: boolean;
}

export interface WorkflowSigner extends WorkflowSignerInput {
  status: SignerStatus;
  signed_at: string | null;
  signature_id: string | null;
}

export interface WorkflowSignature {
  signer_id: string;
  signature_id: string;
  signature_b64: string;
  signed_at: string;
}

export interface Workflow {
  id: string;
  title: string;
  document_name: string;
  document_hash_b64: string;
  hash_algorithm: HashAlgorithm;
  mode: WorkflowMode;
  status: WorkflowStatus;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  message: string;
  signers: WorkflowSigner[];
  signatures: WorkflowSignature[];
  completed_at?: string;
  cancelled_at?: string;
  cancelled_by?: string;
}

export interface CreateWorkflowRequest {
  title: string;
  document_name: string;
  document_hash_b64: string;
  hash_algorithm: HashAlgorithm;
  signers: WorkflowSignerInput[];
  mode: WorkflowMode;
  expires_at?: string | null;
  message?: string;
  created_by: string;
}

export interface CreateWorkflowResponse {
  workflow_id: string;
  status: WorkflowStatus;
  created_at: string;
}

export interface SignStepRequest {
  workflow_id: string;
  signer_id: string;
  key_id: string;
  certificate_pem: string;
}

export interface SignStepResponse {
  workflow_id: string;
  workflow_status: WorkflowStatus;
  signature_id: string;
  signed_at: string;
}

export interface WorkflowListResponse {
  workflows: Workflow[];
  total: number;
}

// ── Audit ────────────────────────────────────────────────────────

export type AuditEventType = 'sign_hash' | 'workflow_created' | 'workflow_cancelled';

export interface AuditEntry {
  event: AuditEventType | string;
  timestamp: string;
  signature_id?: string;
  workflow_id?: string;
  signer_id?: string;
  document_name?: string;
  document_mime?: string;
  hash_algorithm?: HashAlgorithm;
  document_hash_b64?: string;
  certificate_subject?: string;
  signed_at?: string;
  created_by?: string;
  cancelled_by?: string;
  title?: string;
  mode?: WorkflowMode;
  signers?: string[];
}

export interface AuditListResponse {
  logs: AuditEntry[];
  total: number;
}

export interface AuditStats {
  total_signatures: number;
  total_workflows: number;
  total_events: number;
  by_event: Record<string, number>;
  by_algorithm: Record<string, number>;
}

// ── Signataires ──────────────────────────────────────────────────

export type SignerRole = 'signer' | 'admin' | 'auditor';
export type UserStatus = 'active' | 'inactive';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: SignerRole;
  organization: string;
  created_at: string;
  status: UserStatus;
  key_id: string | null;
  certificate_pem: string | null;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  role: SignerRole;
  organization: string;
}

export interface UserListResponse {
  users: AppUser[];
  total: number;
}

// ── Certificats ──────────────────────────────────────────────────

export type CertType = 'signature' | 'tsa' | 'ocsp' | 'tls';

export interface IssueCertRequest {
  key_id: string;
  csr_pem: string;
  cert_type: CertType;
  subject_dn: string;
  username: string;
}
