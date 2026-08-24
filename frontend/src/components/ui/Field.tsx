/** Champs de formulaire accessibles : label lié, erreur annoncée, aide décrite. */
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

const control =
  'w-full rounded border border-line bg-surface px-3 text-base text-ink ' +
  'placeholder:text-muted transition-colors duration-100 ' +
  'hover:border-slate/40 disabled:cursor-not-allowed disabled:bg-ground disabled:text-muted';

const invalid = 'border-danger hover:border-danger';

interface FieldShellProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

function FieldShell({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: FieldShellProps): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="flex items-start gap-1.5 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

// ── Input ────────────────────────────────────────────────────────

export interface InputFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
  mono?: boolean;
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  ({ label, hint, error, wrapperClassName, mono, className, required, ...props }, ref) => {
    const id = useId();
    return (
      <FieldShell
        label={label}
        htmlFor={id}
        hint={hint}
        error={error}
        required={required}
        className={wrapperClassName}
      >
        <input
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(control, 'h-9', mono && 'font-mono text-sm', error && invalid, className)}
          {...props}
        />
      </FieldShell>
    );
  },
);
InputField.displayName = 'InputField';

// ── Textarea ─────────────────────────────────────────────────────

export interface TextareaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  mono?: boolean;
}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  ({ label, hint, error, mono, className, required, rows = 4, ...props }, ref) => {
    const id = useId();
    return (
      <FieldShell label={label} htmlFor={id} hint={hint} error={error} required={required}>
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(
            control,
            'resize-y py-2 leading-relaxed',
            mono && 'font-mono text-sm',
            error && invalid,
            className,
          )}
          {...props}
        />
      </FieldShell>
    );
  },
);
TextareaField.displayName = 'TextareaField';

// ── Select ───────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'children'> {
  label: string;
  options: readonly SelectOption[];
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  (
    { label, options, hint, error, className, wrapperClassName, required, ...props },
    ref,
  ) => {
    const id = useId();
    return (
      <FieldShell
        label={label}
        htmlFor={id}
        hint={hint}
        error={error}
        required={required}
        className={wrapperClassName}
      >
        <select
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(control, 'h-9 cursor-pointer pr-8', error && invalid, className)}
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      </FieldShell>
    );
  },
);
SelectField.displayName = 'SelectField';
