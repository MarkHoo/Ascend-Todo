import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, className, ...rest }, ref) => (
    <div>
      {label && <label className="label">{label}</label>}
      <input ref={ref} className={clsx('input', error && 'border-red-500', className)} {...rest} />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {hint && !error && <p className="text-xs text-text-muted mt-1">{hint}</p>}
    </div>
  ),
);
Input.displayName = 'Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, className, ...rest }, ref) => (
    <div>
      {label && <label className="label">{label}</label>}
      <textarea
        ref={ref}
        className={clsx('input min-h-[80px] resize-y', className)}
        {...rest}
      />
    </div>
  ),
);
Textarea.displayName = 'Textarea';
