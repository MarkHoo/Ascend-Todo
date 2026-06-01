import { ReactNode, useEffect, useRef } from 'react';
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
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.style.transform = 'scale(0.95)';
      panelRef.current.style.opacity = '0';
      requestAnimationFrame(() => {
        if (panelRef.current) {
          panelRef.current.style.transition = 'transform 0.2s cubic-bezier(0.16,1,0.3,1), opacity 0.15s ease';
          panelRef.current.style.transform = 'scale(1)';
          panelRef.current.style.opacity = '1';
        }
      });
    }
  }, [open]);

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
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={clsx('card w-full max-h-[85vh] flex flex-col overflow-hidden shadow-xl')}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <h3 className="text-base font-semibold">{title}</h3>
            <button className="btn-ghost p-1 rounded hover:bg-surface-2" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        )}
        <div className={`p-5 overflow-y-auto flex-1 ${sizeCls}`}>{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-border flex items-center gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
