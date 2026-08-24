import { NavLink } from 'react-router-dom';
import {
  Activity,
  ChevronsLeft,
  FileSignature,
  KeyRound,
  LayoutDashboard,
  PenLine,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { getConfig } from '@/lib/config';
import { useAuth } from '@/services/auth/AuthProvider';
import type { Permission } from '@/services/auth/rbac';
import type { FeatureName } from '@/types/api';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  /** L'entrée disparaît si le backend ne déclare pas cette capacité. */
  feature?: FeatureName;
  end?: boolean;
}

const PRIMARY: NavItem[] = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  {
    to: '/demandes',
    label: 'Demandes de signature',
    icon: FileSignature,
    feature: 'workflows',
  },
  { to: '/signer', label: 'Signature rapide', icon: PenLine, feature: 'hash_signing' },
  { to: '/verifier', label: 'Vérification', icon: ShieldCheck, feature: 'audit_trail' },
];

const SECONDARY: NavItem[] = [
  {
    to: '/signataires',
    label: 'Signataires',
    icon: Users,
    feature: 'users',
    permission: 'signer:manage',
  },
  {
    to: '/cles',
    label: 'Clés & certificats',
    icon: KeyRound,
    feature: 'key_generation',
    permission: 'key:generate',
  },
  {
    to: '/audit',
    label: "Journal d'audit",
    icon: Activity,
    feature: 'audit_trail',
    permission: 'audit:view',
  },
];

const SYSTEM: NavItem[] = [
  {
    to: '/administration',
    label: 'Administration',
    icon: SlidersHorizontal,
    permission: 'admin:access',
  },
  { to: '/parametres', label: 'Paramètres', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  features: Partial<Record<FeatureName, boolean>>;
  onNavigate?: () => void;
}

export function Sidebar({
  collapsed,
  onToggle,
  features,
  onNavigate,
}: SidebarProps): JSX.Element {
  const { can } = useAuth();
  const { branding } = getConfig();

  const visible = (item: NavItem): boolean => {
    if (item.feature && features[item.feature] === false) return false;
    if (item.permission && !can(item.permission)) return false;
    return true;
  };

  const renderGroup = (items: NavItem[], label?: string): JSX.Element | null => {
    const shown = items.filter(visible);
    if (shown.length === 0) return null;

    return (
      <div className="flex flex-col gap-0.5">
        {label && !collapsed ? (
          <p className="px-3 pb-1 pt-4 text-2xs font-semibold uppercase tracking-wide text-muted">
            {label}
          </p>
        ) : (
          <div className={collapsed ? 'pt-3' : ''} />
        )}
        {shown.map(({ to, label: text, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            title={collapsed ? text : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded px-3 py-2 text-base transition-colors duration-100',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-accent-soft font-medium text-accent'
                  : 'text-slate hover:bg-ground hover:text-ink',
              )
            }
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {collapsed ? <span className="sr-only">{text}</span> : <span className="truncate">{text}</span>}
          </NavLink>
        ))}
      </div>
    );
  };

  return (
    <nav
      aria-label="Navigation principale"
      className="flex h-full flex-col border-r border-line bg-surface"
      style={{ width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)' }}
    >
      {/* Marque */}
      <div
        className={cn(
          'flex h-[var(--topbar-h)] shrink-0 items-center gap-2.5 border-b border-line px-3',
          collapsed && 'justify-center px-0',
        )}
      >
        {branding.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt=""
            className="size-7 shrink-0 rounded object-contain"
          />
        ) : (
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded bg-accent text-accent-ink"
            aria-hidden
          >
            <ShieldCheck className="size-4" />
          </span>
        )}
        {!collapsed ? (
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold text-ink">
              {branding.companyName}
            </span>
            <span className="block truncate text-2xs text-muted">
              {branding.productName}
            </span>
          </span>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {renderGroup(PRIMARY)}
        {renderGroup(SECONDARY, 'Gestion')}
        {renderGroup(SYSTEM, 'Système')}
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className={cn(
          'flex shrink-0 items-center gap-2.5 border-t border-line px-3 py-2.5',
          'text-sm text-muted transition-colors hover:text-ink',
          collapsed && 'justify-center px-0',
        )}
      >
        <ChevronsLeft
          className={cn('size-4 shrink-0 transition-transform', collapsed && 'rotate-180')}
          aria-hidden
        />
        {collapsed ? (
          <span className="sr-only">Déplier la navigation</span>
        ) : (
          <span>Réduire</span>
        )}
      </button>
    </nav>
  );
}
