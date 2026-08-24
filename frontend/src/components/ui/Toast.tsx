/** Notifications éphémères. Annoncées aux lecteurs d'écran via aria-live. */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICON = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const;

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-accent',
};

const DURATION: Record<ToastTone, number> = {
  success: 4000,
  info: 5000,
  // Une erreur reste plus longtemps : l'utilisateur doit pouvoir la lire.
  error: 8000,
};

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: string, description?: string) => {
      const id = nextId++;
      setToasts((list) => [...list.slice(-3), { id, tone, title, description }]);
      window.setTimeout(() => dismiss(id), DURATION[tone]);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (t, d) => push('success', t, d),
      error: (t, d) => push('error', t, d),
      info: (t, d) => push('info', t, d),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => {
          const Icon = ICON[toast.tone];
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
              className="pointer-events-auto flex animate-slide-up items-start gap-3 rounded-lg border border-line bg-raised p-3.5 shadow-pop"
            >
              <Icon
                className={cn('mt-0.5 size-4 shrink-0', TONE_CLASS[toast.tone])}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-sm text-slate">{toast.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="-m-1 rounded p-1 text-muted transition-colors hover:text-ink"
                aria-label="Fermer la notification"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast doit être utilisé dans <ToastProvider>');
  return ctx;
}
