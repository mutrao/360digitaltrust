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

export const systemApi = {
  health: () => api.get<HealthResponse>('/v1/health'),
  capabilities: () => api.get<Capabilities>('/v1/capabilities'),
};

export const keysApi = {
  generate: (body: GenerateKeyRequest) =>
    api.post<GenerateKeyResponse>('/v1/keys/generate', body),
  storageBackends: () => api.get<StorageBackendsResponse>('/v1/keys/storage-backends'),
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
