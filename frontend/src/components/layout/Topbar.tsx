import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  CircleHelp,
  LogOut,
  Menu,
  Monitor,
  Moon,
  ShieldAlert,
  Sun,
  UserRound,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Data';
import { cn } from '@/lib/utils';
import { getConfig } from '@/lib/config';
import { useHealth } from '@/hooks/queries';
import { useAuth } from '@/services/auth/AuthProvider';
import { ROLE_LABEL } from '@/services/auth/rbac';

type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'dt-theme';

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

function readTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // Navigation privée ou stockage bloqué : le thème système fait l'affaire.
    return 'system';
  }
}

function ConnectionIndicator(): JSX.Element {
  const { data, isError, isLoading } = useHealth();

  const state = isLoading
    ? { tone: 'bg-muted', label: 'Connexion…' }
    : isError
      ? { tone: 'bg-danger', label: 'Service injoignable' }
      : { tone: 'bg-success', label: `Service actif · v${data?.version ?? '?'}` };

  return (
    <span
      className="hidden items-center gap-1.5 text-sm text-muted sm:inline-flex"
      title={state.label}
    >
      <span className={cn('size-1.5 rounded-full', state.tone)} aria-hidden />
      <span className="sr-only">État du service : </span>
      {state.label}
    </span>
  );
}

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }): JSX.Element {
  const { principal, mode, logout, login, status } = useAuth();
  const { branding } = getConfig();
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      if (theme === 'system') window.localStorage.removeItem(THEME_KEY);
      else window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Préférence non persistée : sans conséquence sur la session courante.
    }
  }, [theme]);

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMobileNav}
        aria-label="Ouvrir la navigation"
      >
        <Menu aria-hidden />
      </Button>

      <div className="min-w-0 flex-1">
        {mode === 'bootstrap' ? (
          <Link
            to="/administration/authentification"
            className="inline-flex items-center gap-1.5 rounded border border-warning/25 bg-warning-soft px-2 py-1 text-sm text-warning transition-colors hover:brightness-95"
          >
            <ShieldAlert className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              Authentification non configurée — accès non restreint
            </span>
          </Link>
        ) : null}
      </div>

      <ConnectionIndicator />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label="Thème de l'interface">
            <ThemeIcon aria-hidden />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-[160px] animate-slide-up rounded-lg border border-line bg-raised p-1 shadow-pop"
          >
            {(
              [
                ['light', 'Clair', Sun],
                ['dark', 'Sombre', Moon],
                ['system', 'Système', Monitor],
              ] as const
            ).map(([value, label, Icon]) => (
              <DropdownMenu.Item
                key={value}
                onSelect={() => setTheme(value)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-base outline-none',
                  'data-[highlighted]:bg-ground',
                  theme === value ? 'font-medium text-accent' : 'text-slate',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {branding.supportEmail ? (
        <Button variant="ghost" size="icon" asChild>
          <a href={`mailto:${branding.supportEmail}`} aria-label="Contacter le support">
            <CircleHelp aria-hidden />
          </a>
        </Button>
      ) : null}

      {status === 'authenticated' && principal ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded px-1 py-1 transition-colors hover:bg-ground"
              aria-label="Menu utilisateur"
            >
              <Avatar name={principal.displayName} />
              <span className="hidden min-w-0 text-left leading-tight sm:block">
                <span className="block truncate text-sm font-medium text-ink">
                  {principal.displayName}
                </span>
                <span className="block truncate text-2xs text-muted">
                  {ROLE_LABEL[principal.role]}
                </span>
              </span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="z-50 min-w-[220px] animate-slide-up rounded-lg border border-line bg-raised p-1 shadow-pop"
            >
              <div className="border-b border-line px-2 py-2">
                <p className="truncate text-sm font-medium text-ink">
                  {principal.displayName}
                </p>
                <p className="truncate text-sm text-muted">{principal.email}</p>
                {principal.organization ? (
                  <p className="mt-0.5 truncate text-2xs text-muted">
                    {principal.organization}
                  </p>
                ) : null}
              </div>
              <DropdownMenu.Item
                onSelect={() => void logout()}
                className="mt-1 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-base text-slate outline-none data-[highlighted]:bg-ground"
              >
                <LogOut className="size-4" aria-hidden />
                Se déconnecter
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : mode === 'oidc' ? (
        <Button variant="primary" size="sm" onClick={() => void login()}>
          <UserRound aria-hidden />
          Se connecter
        </Button>
      ) : null}
    </header>
  );
}
