import { AlertCircle, AlertTriangle, Inbox, Megaphone } from 'lucide-react';
import type { NotificationType, NotificationPriority } from '@myk9/notifications';

export function PriorityIcon({
  priority,
  type,
}: {
  priority: NotificationPriority;
  type: NotificationType;
}) {
  if (type === 'announcement') {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-purple-500/15">
        <Megaphone className="h-4 w-4 text-purple-400" />
      </div>
    );
  }
  if (priority === 'urgent') {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-red-500/15">
        <AlertCircle className="h-4 w-4 text-red-400" />
      </div>
    );
  }
  if (priority === 'high') {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
      </div>
    );
  }
  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
      <Inbox className="h-4 w-4 text-blue-400" />
    </div>
  );
}
