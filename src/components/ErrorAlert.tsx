interface ErrorAlertProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorAlert({ message, onDismiss }: ErrorAlertProps) {
  return (
    <div className="alert alert-error" role="alert">
      <span>{message}</span>
      {onDismiss && (
        <button className="btn btn-ghost btn-xs" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}
