import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div className={cn('card p-12 grid place-items-center text-center', className)}>
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-surface-3 grid place-items-center text-content-muted mb-4">
          {icon}
        </div>
      )}
      <div className="font-semibold text-content">{title}</div>
      {description && (
        <div className="text-sm text-content-muted mt-1 max-w-sm">{description}</div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
