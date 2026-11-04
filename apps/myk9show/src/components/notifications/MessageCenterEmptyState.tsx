import type { Inbox } from 'lucide-react';

export function EmptyPanelState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Inbox;
  title: string;
  body?: string | undefined;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <Icon className="mb-3 h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{title}</p>
      {body && <p className="mt-1 text-xs text-muted-foreground">{body}</p>}
    </div>
  );
}
