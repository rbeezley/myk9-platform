import type { ClassReleaseTiming } from './classManualReleaseTiming';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

/**
 * Why Hide results is held back for a released class, or null when it can be pressed. Offline
 * first, then what the visibility settings say, then another action in flight.
 */
export function hideBlockedReason({
  online,
  timing,
  busy,
}: {
  online: boolean;
  timing: ClassReleaseTiming;
  busy: boolean;
}): string | null {
  if (!online) return 'Needs a connection to hide results.';
  if (timing === 'unknown') return "Checking this class's visibility settings.";
  if (timing === 'unreadable') return "Could not read this class's visibility settings.";
  if (timing === 'not-manual') {
    return 'This class shows results as they are scored. Set it to After Review in Visibility settings to hide them.';
  }
  return busy ? 'Wait for the current action to finish.' : null;
}

/** Takes a released class back to unreleased (MYK9-1318). */
export function HideResultsButton({
  className,
  hiding,
  blockedReason,
  onHide,
}: {
  className: string;
  hiding: boolean;
  blockedReason: string | null;
  onHide: () => void;
}) {
  return (
    <AlertDialog>
      <div className="space-y-1 sm:text-right">
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={hiding || blockedReason !== null}
          >
            Hide results
          </Button>
        </AlertDialogTrigger>
        {blockedReason && <p className="text-xs text-muted-foreground">{blockedReason}</p>}
      </div>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hide results for {className}?</AlertDialogTitle>
          <AlertDialogDescription>
            Exhibitors and spectators will stop seeing these results. A page someone already has
            open keeps showing them until it is reloaded. You can release them again at any time.
          </AlertDialogDescription>
          {/* Things can change while the dialog is open (connection, settings, a release). */}
          {blockedReason && <p className="text-sm text-muted-foreground">{blockedReason}</p>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={hiding}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onHide} disabled={hiding || blockedReason !== null}>
            Hide results
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
