/**
 * Pastilles d'état.
 *
 * L'état est encodé par la forme *et* la couleur (point + libellé), jamais
 * par la couleur seule : lisible en niveaux de gris et pour les daltoniens.
 */
import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { SignerStatus, UserStatus, WorkflowStatus } from '@/types/api';

const badge = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'border-line bg-ground text-slate',
        accent: 'border-accent/25 bg-accent-soft text-accent',
        success: 'border-success/25 bg-success-soft text-success',
        warning: 'border-warning/25 bg-warning-soft text-warning',
        danger: 'border-danger/25 bg-danger-soft text-danger',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type Tone = NonNullable<VariantProps<typeof badge>['tone']>;

interface BadgeProps extends VariantProps<typeof badge> {
  children: ReactNode;
  dot?: boolean;
  className?: string;
}

export function Badge({ children, tone, dot, className }: BadgeProps): JSX.Element {
  return (
    <span className={cn(badge({ tone }), className)}>
      {dot ? (
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
      ) : null}
      {children}
    </span>
  );
}

// ── États métier ─────────────────────────────────────────────────

const WORKFLOW: Record<WorkflowStatus, { label: string; tone: Tone }> = {
  pending: { label: 'En attente', tone: 'warning' },
  completed: { label: 'Signé', tone: 'success' },
  cancelled: { label: 'Annulé', tone: 'neutral' },
};

/**
 * `expired` n'est pas un statut backend : c'est une lecture de `expires_at`
 * sur un workflow encore `pending`. Distinction volontairement explicite.
 */
export function WorkflowStatusBadge({
  status,
  expired,
}: {
  status: WorkflowStatus;
  expired?: boolean;
}): JSX.Element {
  if (expired && status === 'pending') {
    return (
      <Badge tone="danger" dot>
        Expiré
      </Badge>
    );
  }
  const { label, tone } = WORKFLOW[status];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

export function SignerStatusBadge({ status }: { status: SignerStatus }): JSX.Element {
  return status === 'signed' ? (
    <Badge tone="success" dot>
      Signé
    </Badge>
  ) : (
    <Badge tone="warning" dot>
      En attente
    </Badge>
  );
}

export function UserStatusBadge({ status }: { status: UserStatus }): JSX.Element {
  return status === 'active' ? (
    <Badge tone="success" dot>
      Actif
    </Badge>
  ) : (
    <Badge tone="neutral" dot>
      Désactivé
    </Badge>
  );
}
