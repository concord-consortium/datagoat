import type { BadgeDefinition } from "../types/badges";

interface BadgeNotificationProps {
  badge: BadgeDefinition;
  username: string;
  onDismiss: () => void;
}

export function BadgeNotification({
  badge,
  username,
  onDismiss,
}: BadgeNotificationProps) {
  const message = badge.messageTemplate.replace("{name}", username);

  return (
    <div className="toast toast-top toast-center z-50">
      <div className="alert alert-success shadow-lg">
        <div>
          <span className="text-2xl" aria-hidden="true">&#x1f3c6;</span>
          <div>
            <h3 className="font-bold">{badge.name}</h3>
            <p className="text-base">{message}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
