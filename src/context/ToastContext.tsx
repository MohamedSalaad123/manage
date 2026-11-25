import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

interface ToastItem {
  id: number;
  type: 'success' | 'error';
  message: string;
}

interface ToastContextValue {
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: 'success' | 'error', message: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => remove(id), 4500);
    },
    [remove]
  );

  const showSuccess = useCallback((msg: string) => push('success', msg), [push]);
  const showError = useCallback((msg: string) => push('error', msg), [push]);

  return (
    <ToastContext.Provider value={{ showSuccess, showError }}>
      {children}
      <div className="no-print fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 bg-white border shadow-sm rounded-lg text-sm transition-all ${
              toast.type === 'success'
                ? 'border-emerald-200 text-slate-900'
                : 'border-red-200 text-slate-900'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <p className="flex-1 text-xs font-medium leading-relaxed">{toast.message}</p>
            <button
              type="button"
              onClick={() => remove(toast.id)}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
