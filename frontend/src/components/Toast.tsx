import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem { id: number; message: string; variant: ToastVariant }

interface ToastContextValue { toast: (message: string, variant?: ToastVariant) => void }

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

let _counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) =>
    setItems(prev => prev.filter(t => t.id !== id)), []);

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = ++_counter;
    setItems(prev => [...prev, { id, message, variant }]);
    setTimeout(() => remove(id), 4000);
  }, [remove]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {items.map(item => (
          <div
            key={item.id}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm text-white min-w-64',
              item.variant === 'success' && 'bg-green-600',
              item.variant === 'error'   && 'bg-red-600',
              item.variant === 'info'    && 'bg-gray-800',
            )}
          >
            <span className="flex-1">{item.message}</span>
            <button onClick={() => remove(item.id)} className="opacity-70 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() { return useContext(ToastContext); }
