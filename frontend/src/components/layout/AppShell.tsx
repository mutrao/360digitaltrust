import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';

import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useCapabilities } from '@/hooks/queries';
import type { Capabilities } from '@/types/api';

const COLLAPSE_KEY = 'dt-nav-collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Tant que les capacités ne sont pas connues, on affiche tout : une entrée
 * qui apparaît est moins déroutante qu'une entrée qui disparaît sous le curseur.
 */
const OPTIMISTIC: Partial<Capabilities['features']> = {};

export function AppShell(): JSX.Element {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { data } = useCapabilities();

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      // Préférence non persistée : sans conséquence.
    }
  }, [collapsed]);

  const features = data?.features ?? OPTIMISTIC;

  return (
    <div className="flex h-screen overflow-hidden bg-ground">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink"
      >
        Aller au contenu
      </a>

      {/* Navigation permanente à partir de lg */}
      <div className="hidden shrink-0 lg:block">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          features={features}
        />
      </div>

      {/* Navigation en tiroir sous lg */}
      <Dialog.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-ink/35 lg:hidden" />
          <Dialog.Content
            className="fixed inset-y-0 left-0 z-50 animate-fade-in lg:hidden"
            aria-label="Navigation principale"
          >
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileNavOpen(false)}
              features={features}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main id="contenu" className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-content px-5 py-6 sm:px-6 sm:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
