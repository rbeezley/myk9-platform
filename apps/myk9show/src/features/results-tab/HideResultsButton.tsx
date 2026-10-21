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
 * Takes a released class back to unreleased (MYK9-1318). Un-releasing is a replicated write, so
 * it is queued offline too, unlike Release, which asks the server first.
 */
export function HideResultsButton({
  className,
  hiding,
  onHide,
}: {
  className: string;
  hiding: boolean;
  onHide: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11" disabled={hiding}>
          Hide results
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hide results for {className}?</AlertDialogTitle>
          <AlertDialogDescription>
            Exhibitors and spectators will stop seeing these results. A page someone already has
            open keeps showing them until it is reloaded. You can release them again at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={hiding}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onHide} disabled={hiding}>
            Hide results
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
