import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ShowMapAction } from './showMapActions';

interface ShowMapGuidanceCardProps {
  action: ShowMapAction | undefined;
  canExecute: boolean;
  onStart: () => void;
  onDismiss: () => void;
}

export function ShowMapGuidanceCard({
  action,
  canExecute,
  onStart,
  onDismiss,
}: ShowMapGuidanceCardProps) {
  if (!action) return null;

  return (
    <section aria-label="Next best action" className="mb-3 rounded-md border bg-muted/15 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Next best action
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">Next: {action.label}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">{action.why}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canExecute && (
            <Button type="button" size="sm" onClick={onStart}>
              <action.icon className="h-4 w-4" />
              Start
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
