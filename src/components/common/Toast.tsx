import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { create } from 'zustand';
import { nanoid } from 'nanoid';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface State {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  remove: (id: string) => void;
}

const useToastStore = create<State>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nanoid();
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, 3500);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (message: string) => useToastStore.getState().push({ type: 'success', message }),
  error: (message: string) => useToastStore.getState().push({ type: 'error', message }),
  info: (message: string) => useToastStore.getState().push({ type: 'info', message }),
};

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="card flex items-center gap-2 px-3 py-2 min-w-[240px] animate-in"
          style={{ boxShadow: '0 4px 16px var(--shadow)' }}
        >
          {t.type === 'success' && <CheckCircle2 size={18} className="text-green-500" />}
          {t.type === 'error' && <AlertCircle size={18} className="text-red-500" />}
          {t.type === 'info' && <Info size={18} className="text-blue-500" />}
          <span className="flex-1 text-sm">{t.message}</span>
          <button onClick={() => remove(t.id)} className="text-text-muted">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
