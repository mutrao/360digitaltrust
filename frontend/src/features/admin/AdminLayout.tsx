import { NavLink, Outlet } from 'react-router-dom';
import {
  Activity,
  Building2,
  Info,
  KeyRound,
  Palette,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

import { PageHeader } from '@/components/ui/Card';
import { PermissionDenied } from '@/components/ui/States';
import { cn } from '@/lib/utils';
import { useAuth } from '@/services/auth/AuthProvider';

interface AdminSection {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const SECTIONS: AdminSection[] = [
  { to: '/administration', label: 'Organisation', icon: Building2, end: true },
  { to: '/administration/authentification', label: 'Authentification', icon: KeyRound },
  { to: '/administration/branding', label: 'Apparence', icon: Palette },
  { to: '/administration/securite', label: 'Sécurité', icon: ShieldCheck },
  { to: '/administration/diagnostic', label: 'Diagnostic', icon: Activity },
  { to: '/administration/a-propos', label: 'À propos', icon: Info },
];

export function AdminLayout(): JSX.Element {
  const { can } = useAuth();

  if (!can('admin:access')) {
    return <PermissionDenied what="accéder à l'administration" />;
  }

  return (
    <>
      <PageHeader
        title="Administration"
        description="Configuration de la plateforme et diagnostic de l'installation."
      />

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Sections d'administration">
          <ul className="flex flex-row gap-1 overflow-x-auto lg:flex-col">
            {SECTIONS.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 whitespace-nowrap rounded px-3 py-2 text-base transition-colors',
                      isActive
                        ? 'bg-accent-soft font-medium text-accent'
                        : 'text-slate hover:bg-ground hover:text-ink',
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </>
  );
}
