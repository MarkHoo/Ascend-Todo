import { ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'primary', size = 'md', block, className, children, ...rest }, ref) => {
    const v =
      variant === 'primary'
        ? 'btn-primary'
        : variant === 'ghost'
          ? 'btn-ghost'
          : variant === 'outline'
            ? 'btn-outline'
            : 'btn-danger';
    const s =
      size === 'sm' ? 'text-xs px-2.5 py-1' : size === 'lg' ? 'text-base px-5 py-2.5' : '';
    return (
      <button
        ref={ref}
        className={clsx(v, s, block && 'w-full', className)}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
