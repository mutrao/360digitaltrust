import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded font-medium whitespace-nowrap ' +
    'transition-colors duration-100 disabled:pointer-events-none disabled:opacity-45 ' +
    '[&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
        secondary: 'border border-line bg-surface text-ink hover:bg-ground',
        ghost: 'text-slate hover:bg-ground hover:text-ink',
        danger: 'bg-danger text-white hover:brightness-110',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-sm [&_svg]:size-3.5',
        md: 'h-9 px-4 text-base [&_svg]:size-4',
        lg: 'h-10 px-5 text-base [&_svg]:size-4',
        icon: 'h-9 w-9 [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  /** Rend l'élément enfant à la place du <button> — pour un lien de navigation. */
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild, loading, children, disabled, ...props },
    ref,
  ) => {
    const classes = cn(button({ variant, size }), className);

    // Slot n'accepte qu'un seul enfant : lui passer `children` accompagné d'un
    // indicateur de chargement le fait échouer au rendu. Les boutons `asChild`
    // sont des liens de navigation, jamais des actions asynchrones — ils n'ont
    // donc pas d'état de chargement à afficher.
    if (asChild) {
      return (
        <Slot ref={ref} className={classes} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
