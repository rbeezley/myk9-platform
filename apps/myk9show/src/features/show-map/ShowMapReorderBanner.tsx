import { GripVertical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ShowMapActiveReorder } from './useShowMapReorderMode';

interface ShowMapReorderBannerProps {
  active: ShowMapActiveReorder;
  isPersisting: boolean;
  onDone: () => void;
}

// INTENT: The banner is the only modal cue that reorder mode is active.
// Keep it visible at the top of the workbench so the secretary always sees
// the way out (Done + Escape) and the current persistence state.
export function ShowMapReorderBanner({
  active,
  isPersisting,
  onDone,
}: ShowMapReorderBannerProps) {

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <GripVertical className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0">
            <span className="font-medium">Reordering {active.classLabel}</span>
            <span className="text-muted-foreground">
              {' '}
              — drag entries to set order. Press Escape or Done to exit.
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isPersisting && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Saving...
            </span>
          )}
          <Button type="button" variant="default" size="sm" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
