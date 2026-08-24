/**
 * Un module par domaine backend. Chaque fonction correspond à une route
 * réellement présente dans signature-api — rien d'inventé.
 */
import { api } from './client';
import type {
  AppUser,
  AuditListResponse,
  AuditStats,
  AuditEntry,
  Capabilities,
  CreateUserRequest,
  CreateWorkflowRequest,
  CreateWorkflowResponse,
  GenerateKeyRequest,
  GenerateKeyResponse,
  HealthResponse,
  IssueCertRequest,
  SignHashRequest,
  SignHashResponse,
  SignStepRequest,
  SignStepResponse,
  StorageBackendsResponse,
  UserListResponse,
  Workflow,
  WorkflowListResponse,
  WorkflowStatus,
} from '@/types/api';

/**
 * Garantit qu'une réponse de liste porte bien un tableau.
 *
 * Le backend est censé renvoyer `{items: [...], total: n}`, mais une version
 * plus ancienne, un proxy intercalé ou une route absente peuvent produire
 * autre chose. Sans ce filet, un champ manquant fait planter le composant qui
 * l'affiche, loin de la cause réelle. On normalise ici, une fois, plutôt que
 * de protéger chaque accès dans l'interface.
 */
function asList<K extends string, T>(
  raw: unknown,
  key: K,
): { [P in K]: T[] } & { total: number } {
  const source = (raw ?? {}) as Record<string, unknown>;
  const items = Array.isArray(source[key]) ? (source[key] as T[]) : [];
  const total = typeof source.total === 'number' ? source.total : items.length;
  return { [key]: items, total } as { [P in K]: T[] } & { total: number };
}

function obj(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Les drapeaux de capacité pilotent l'affichage : une valeur absente doit
 * signifier « non disponible », jamais faire échouer le rendu. Un backend plus
 * ancien qui ignore une fonctionnalité récente la renvoie simplement absente.
 */
function normaliseCapabilities(raw: unknown): Capabilities {
  const source = obj(raw);
  const features = obj(source.features);
  const storage = obj(source.storage);

  const flag = (name: string, fallback = false): boolean =>
    bool(features[name], fallback);

  return {
    version: typeof source.version === 'string' ? source.version : 'inconnue',
    features: {
      // Le socle du produit : présumé disponible si le backend ne se prononce pas.
      hash_signing: flag('hash_signing', true),
      pdf_signing: flag('pdf_signing'),
      xml_signing: flag('xml_signing'),
      cms_signing: flag('cms_signing'),
      workflows: flag('workflows', true),
      audit_trail: flag('audit_trail', true),
      users: flag('users', true),
      key_generation: flag('key_generation', true),
      certificate_issuance: flag('certificate_issuance'),
      ocsp: flag('ocsp'),
      timestamping: flag('timestamping'),
      // Non implémentées : l'absence vaut « non », sans présomption.
      document_storage: flag('document_storage'),
      email_notifications: flag('email_notifications'),
      templates: flag('templates'),
      pdf_field_placement: flag('pdf_field_placement'),
      authentication: flag('authentication'),
    },
    storage: {
      vault_available: bool(storage.vault_available),
      local_keys: bool(storage.local_keys, true),
    },
  };
}

function normaliseStorageBackends(raw: unknown): StorageBackendsResponse {
  const source = obj(raw);
  const local = obj(source.local);
  const vault = obj(source.vault);

  return {
    local: {
      // Le stockage local ne dépend d'aucun service externe : toujours offert.
      available: bool(local.available, true),
      label: typeof local.label === 'string' ? local.label : 'Stockage local (volume API)',
    },
    vault: {
      available: bool(vault.available),
      label: typeof vault.label === 'string' ? vault.label : 'HashiCorp Vault',
    },
  };
}

export const systemApi = {
  health: () => api.get<HealthResponse>('/v1/health'),
  capabilities: async () => normaliseCapabilities(await api.get<unknown>('/v1/capabilities')),
};

export const keysApi = {
  generate: (body: GenerateKeyRequest) =>
    api.post<GenerateKeyResponse>('/v1/keys/generate', body),
  storageBackends: async () =>
    normaliseStorageBackends(await api.get<unknown>('/v1/keys/storage-backends')),
};

export const certificatesApi = {
  issue: (body: IssueCertRequest) =>
    api.post<{ status: string; certificate: unknown }>('/v1/certificates/issue', body),
  listCas: () => api.get<unknown>('/v1/certificates/cas'),
};

export const signApi = {
  /** Signature de l'empreinte seule — le document ne quitte pas le navigateur. */
  hash: (body: SignHashRequest) => api.post<SignHashResponse>('/v1/sign/hash/sign', body),
};

export const workflowsApi = {
  list: async (params?: { status?: WorkflowStatus; limit?: number }) =>
    asList<'workflows', Workflow>(
      await api.get<unknown>('/v1/workflows/', {
        status: params?.status,
        limit: params?.limit ?? 100,
      }),
      'workflows',
    ) as WorkflowListResponse,
  get: (id: string) => api.get<Workflow>(`/v1/workflows/${encodeURIComponent(id)}`),
  create: (body: CreateWorkflowRequest) =>
    api.post<CreateWorkflowResponse>('/v1/workflows/create', body),
  signStep: (body: SignStepRequest) =>
    api.post<SignStepResponse>('/v1/workflows/sign-step', body),
  cancel: (id: string, cancelledBy: string) =>
    api.del<{ status: string }>(`/v1/workflows/${encodeURIComponent(id)}`, {
      cancelled_by: cancelledBy,
    }),
};

export const auditApi = {
  logs: async (params?: { limit?: number; event_type?: string; signer_id?: string }) =>
    asList<'logs', AuditEntry>(
      await api.get<unknown>('/v1/audit/logs', {
        limit: params?.limit ?? 200,
        event_type: params?.event_type,
        signer_id: params?.signer_id,
      }),
      'logs',
    ) as AuditListResponse,
  entry: (signatureId: string) =>
    api.get<AuditEntry>(`/v1/audit/logs/${encodeURIComponent(signatureId)}`),
  stats: () => api.get<AuditStats>('/v1/audit/stats'),
};

export const usersApi = {
  list: async (role?: string) =>
    asList<'users', AppUser>(
      await api.get<unknown>('/v1/users/', { role }),
      'users',
    ) as UserListResponse,
  get: (id: string) => api.get<AppUser>(`/v1/users/${encodeURIComponent(id)}`),
  create: (body: CreateUserRequest) => api.post<AppUser>('/v1/users/', body),
  deactivate: (id: string) =>
    api.del<{ status: string }>(`/v1/users/${encodeURIComponent(id)}`),
  /**
   * Le backend attend key_id et certificate_pem en paramètres de requête,
   * pas dans le corps — comportement inhabituel mais documenté.
   */
  attachCertificate: (id: string, keyId: string, certificatePem: string) =>
    api.put<{ status: string; user_id: string }>(
      `/v1/users/${encodeURIComponent(id)}/certificate`,
      undefined,
      { key_id: keyId, certificate_pem: certificatePem },
    ),
};
