import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { DeepLinkedUser } from './useDeepLinkedUser';

/** Inline outcome of the support deep link's user lookup: a miss, or a failed lookup. */
export function DeepLinkLookupAlerts({
  notFound,
  lookupFailed,
  retryLookup,
}: Pick<DeepLinkedUser, 'notFound' | 'lookupFailed' | 'retryLookup'>) {
  if (lookupFailed) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>Could not look up that user. Check your connection and try again.</span>
          <Button variant="outline" className="min-h-11 shrink-0" onClick={retryLookup}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (notFound) {
    return (
      <Alert variant="destructive">
        <AlertDescription>User not found. Showing the full list instead.</AlertDescription>
      </Alert>
    );
  }
  return null;
}
