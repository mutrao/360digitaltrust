/**
 * Hooks de données. Les composants n'appellent jamais l'API directement :
 * ils consomment ces hooks, ce qui garantit un cache et des clés cohérents.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import {
  auditApi,
  keysApi,
  signApi,
  systemApi,
  usersApi,
  workflowsApi,
} from '@/services/api/endpoints';
import type {
  AuditStats,
  Capabilities,
  CreateUserRequest,
  CreateWorkflowRequest,
  GenerateKeyRequest,
  SignHashRequest,
  SignStepRequest,
  Workflow,
  WorkflowStatus,
} from '@/types/api';

export const qk = {
  capabilities: ['capabilities'] as const,
  health: ['health'] as const,
  storageBackends: ['keys', 'storage-backends'] as const,
  workflows: (status?: WorkflowStatus) => ['workflows', status ?? 'all'] as const,
  workflow: (id: string) => ['workflows', id] as const,
  auditLogs: (filters?: Record<string, unknown>) => ['audit', 'logs', filters ?? {}] as const,
  auditEntry: (id: string) => ['audit', 'entry', id] as const,
  auditStats: ['audit', 'stats'] as const,
  users: (role?: string) => ['users', role ?? 'all'] as const,
};

// ── Système ──────────────────────────────────────────────────────

export function useCapabilities(): UseQueryResult<Capabilities> {
  return useQuery({
    queryKey: qk.capabilities,
    queryFn: systemApi.capabilities,
    // Les capacités ne changent qu'au redéploiement du backend.
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

export function useHealth(enabled = true) {
  return useQuery({
    queryKey: qk.health,
    queryFn: systemApi.health,
    enabled,
    refetchInterval: 30_000,
    retry: false,
  });
}

// ── Workflows ────────────────────────────────────────────────────

export function useWorkflows(status?: WorkflowStatus) {
  return useQuery({
    queryKey: qk.workflows(status),
    queryFn: () => workflowsApi.list({ status, limit: 100 }),
    staleTime: 15_000,
  });
}

export function useWorkflow(id: string | undefined) {
  return useQuery({
    queryKey: qk.workflow(id ?? ''),
    queryFn: () => workflowsApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWorkflowRequest) => workflowsApi.create(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useSignWorkflowStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SignStepRequest) => workflowsApi.signStep(body),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: qk.workflow(variables.workflow_id) });
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useCancelWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, by }: { id: string; by: string }) => workflowsApi.cancel(id, by),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: qk.workflow(variables.id) });
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

// ── Audit ────────────────────────────────────────────────────────

export function useAuditLogs(filters?: {
  limit?: number;
  event_type?: string;
  signer_id?: string;
}) {
  return useQuery({
    queryKey: qk.auditLogs(filters),
    queryFn: () => auditApi.logs(filters),
    staleTime: 15_000,
  });
}

export function useAuditEntry(signatureId: string | undefined) {
  return useQuery({
    queryKey: qk.auditEntry(signatureId ?? ''),
    queryFn: () => auditApi.entry(signatureId as string),
    enabled: Boolean(signatureId),
    retry: false,
  });
}

export function useAuditStats(): UseQueryResult<AuditStats> {
  return useQuery({
    queryKey: qk.auditStats,
    queryFn: auditApi.stats,
    staleTime: 30_000,
  });
}

// ── Signataires ──────────────────────────────────────────────────

export function useUsers(role?: string) {
  return useQuery({
    queryKey: qk.users(role),
    queryFn: () => usersApi.list(role),
    staleTime: 60_000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserRequest) => usersApi.create(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.deactivate(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useAttachCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, keyId, pem }: { id: string; keyId: string; pem: string }) =>
      usersApi.attachCertificate(id, keyId, pem),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

// ── Clés et signature ────────────────────────────────────────────

export function useStorageBackends() {
  return useQuery({
    queryKey: qk.storageBackends,
    queryFn: keysApi.storageBackends,
    staleTime: 60_000,
  });
}

export function useGenerateKey() {
  return useMutation({
    mutationFn: (body: GenerateKeyRequest) => keysApi.generate(body),
  });
}

export function useSignHash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SignHashRequest) => signApi.hash(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['audit'] }),
  });
}

// ── Dérivations ──────────────────────────────────────────────────

/** Progression d'un workflow, en tenant compte des signataires facultatifs. */
export function workflowProgress(workflow: Workflow): {
  signed: number;
  required: number;
  percent: number;
} {
  const required = workflow.signers.filter((s) => s.required);
  const signed = required.filter((s) => s.status === 'signed').length;
  return {
    signed,
    required: required.length,
    percent: required.length === 0 ? 0 : Math.round((signed / required.length) * 100),
  };
}

/** Prochain signataire attendu — en séquentiel, le plus petit rang non signé. */
export function nextSigner(workflow: Workflow) {
  const pending = workflow.signers.filter((s) => s.status === 'pending');
  if (pending.length === 0) return null;
  if (workflow.mode !== 'sequential') return pending[0] ?? null;
  return [...pending].sort((a, b) => a.order - b.order)[0] ?? null;
}
