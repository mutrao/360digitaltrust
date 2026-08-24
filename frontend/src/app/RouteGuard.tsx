/**
 * Garde de route.
 *
 * Rappel : ce garde protège l'affichage, pas les données. Sans validation de
 * jeton côté backend, il relève de l'ergonomie. Voir docs/SECURITY.md.
 */
import type { ReactNode } from 'react';
import { Loader2, LogIn, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { PermissionDenied } from '@/components/ui/States';
import { getConfig } from '@/lib/config';
import { useAuth } from '@/services/auth/AuthProvider';
import type { Permission } from '@/services/auth/rbac';

function FullScreen({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-6">
      {children}
    </div>
  );
}

/** Écran de connexion — sobre, sans promesse marketing. */
function SignInScreen(): JSX.Element {
  const { login, error } = useAuth();
  const { branding } = getConfig();

  return (
    <FullScreen>
      <div className="w-full max-w-sm text-center">
        <span
          className="mx-auto mb-5 flex size-11 items-center justify-center rounded-lg bg-accent text-accent-ink"
          aria-hidden
        >
          <ShieldCheck className="size-5" />
        </span>

        <h1 className="text-2xl font-semibold text-ink">{branding.companyName}</h1>
        <p className="mt-1.5 text-base text-slate">{branding.productName}</p>

        <div className="mt-8 rounded-lg border border-line bg-surface p-6 shadow-raise">
          <p className="text-base text-slate">
            Connectez-vous avec votre compte d'entreprise pour accéder à la plateforme.
          </p>
          <Button
            variant="primary"
            className="mt-5 w-full"
            onClick={() => void login()}
          >
            <LogIn aria-hidden />
            Se connecter
          </Button>

          {error ? (
            <p role="alert" className="mt-4 text-sm text-danger">
              La connexion a échoué. Vérifiez auprès de votre administrateur que le
              fournisseur d'identité est accessible.
            </p>
          ) : null}
        </div>

        {branding.supportEmail ? (
          <p className="mt-6 text-sm text-muted">
            Besoin d'aide ?{' '}
            <a
              href={`mailto:${branding.supportEmail}`}
              className="text-accent underline-offset-4 hover:underline"
            >
              Contacter le support
            </a>
          </p>
        ) : null}
      </div>
    </FullScreen>
  );
}

interface RouteGuardProps {
  children: ReactNode;
  permission?: Permission;
}

export function RouteGuard({ children, permission }: RouteGuardProps): JSX.Element {
  const { mode, status, can } = useAuth();

  if (mode === 'oidc') {
    if (status === 'loading') {
      return (
        <FullScreen>
          <div className="text-center" role="status">
            <Loader2 className="mx-auto size-6 animate-spin text-accent" aria-hidden />
            <p className="mt-3 text-base text-slate">Vérification de votre session…</p>
          </div>
        </FullScreen>
      );
    }

    if (status !== 'authenticated') return <SignInScreen />;
  }

  if (permission && !can(permission)) return <PermissionDenied />;

  return <>{children}</>;
}
