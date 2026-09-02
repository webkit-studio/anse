import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface Toast {
  id: number;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

const ToastContext = createContext<(text: string, action?: { label: string; onClick: () => void }) => void>(
  () => undefined,
);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((text: string, action?: { label: string; onClick: () => void }) => {
    const id = nextId.current++;
    // max 2 najednou — při rychlém sledu akcí se potvrzení nesmí vrstvit přes obsah
    setToasts((t) => [...t.slice(-1), { id, text, actionLabel: action?.label, onAction: action?.onClick }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.text}</span>
            {t.actionLabel && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.onAction?.();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
