/** Boîtes de dialogue accessibles (Radix : focus piégé, Échap, ARIA). */
import { useState, type ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { Button } from './Button';
import { InputField } from './Field';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps): JSX.Element {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-ink/35 backdrop-blur-[1px]" />
        <RadixDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2',
            '-translate-y-1/2 animate-slide-up rounded-xl border border-line bg-raised shadow-pop',
            'max-h-[85vh] overflow-y-auto',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <RadixDialog.Title className="text-lg font-semibold text-ink">
                {title}
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-sm text-slate">
                  {description}
                </RadixDialog.Description>
              ) : null}
            </div>
            <RadixDialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Fermer">
                <X aria-hidden />
              </Button>
            </RadixDialog.Close>
          </div>

          {children ? <div className="px-5 py-4">{children}</div> : null}

          {footer ? (
            <div className="flex items-center justify-end gap-2 border-t border-line bg-ground/50 px-5 py-3.5">
              {footer}
            </div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  destructive?: boolean;
  /**
   * Pour les actions vraiment irréversibles : impose la saisie littérale
   * de « CONFIRMER ». À réserver aux cas qui le justifient — un garde-fou
   * généralisé n'est plus un garde-fou.
   */
  requireTypedConfirmation?: boolean;
}

const CONFIRM_WORD = 'CONFIRMER';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmer',
  onConfirm,
  loading,
  destructive,
  requireTypedConfirmation,
}: ConfirmDialogProps): JSX.Element {
  const [typed, setTyped] = useState('');
  const blocked = requireTypedConfirmation && typed.trim() !== CONFIRM_WORD;

  const handleOpenChange = (next: boolean): void => {
    if (!next) setTyped('');
    onOpenChange(next);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Annuler
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={() => void onConfirm()}
            loading={loading}
            disabled={blocked}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {requireTypedConfirmation ? (
        <InputField
          label={`Saisissez ${CONFIRM_WORD} pour continuer`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          mono
        />
      ) : null}
    </Dialog>
  );
}
