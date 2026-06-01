import { type ReactNode, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative card max-w-md w-full shadow-pop overflow-hidden">
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 btn-ghost p-1.5 z-10"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'w-11 h-11 rounded-xl grid place-items-center shrink-0',
                destructive ? 'bg-danger/10 text-danger' : 'bg-brand-soft text-brand'
              )}
            >
              <AlertTriangle size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold leading-snug">{title}</h2>
              {description && (
                <div className="text-sm text-content-muted mt-1.5 leading-relaxed">
                  {description}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-2 bg-surface-3/40">
          <button className="btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={destructive ? 'btn bg-danger text-white hover:bg-danger/90' : 'btn-primary'}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
