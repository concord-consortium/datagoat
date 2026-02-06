import type { ReactNode } from "react";

interface EmptyStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}

export function EmptyState({
  message,
  actionLabel,
  onAction,
  children,
}: EmptyStateProps) {
  return (
    <div className="card bg-base-100 shadow-sm p-8 text-center">
      <div className="text-4xl mb-3 text-base-content/20" aria-hidden="true">
        &#x1f4ca;
      </div>
      <p className="text-base-content/60 mb-4">{message}</p>
      {actionLabel && onAction && (
        <button className="btn btn-primary btn-sm" onClick={onAction}>
          {actionLabel}
        </button>
      )}
      {children}
    </div>
  );
}
