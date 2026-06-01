import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, size = 'md', footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;
  const sizeCls = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className={clsx('card w-full max-h-[90vh] flex flex-col overflow-hidden')}
        style={{ maxWidth: undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h3 className="text-base font-semibold">{title}</h3>
            <button className="btn-ghost p-1 rounded" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        )}
        <div className={`p-5 overflow-y-auto ${sizeCls}`}>{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-border flex justify-end gap-2">{footer}</div>
        )}
      </div>
    </div>
  );
}
