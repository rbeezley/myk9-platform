import { AlertCircle } from 'lucide-react';
import { RingsideUpButton } from '@myk9/ui';
import { Button } from '@/components/ui/button';

interface Props {
  onRetry: () => void;
  onBack: () => void;
}

/**
 * MYK9-1675: a signed-in judge whose account lookup finished without a person
 * (or failed) cannot be checked against the class assignment, and waiting will
 * not fix it. Same layout as the scoresheet's load-failure screen: say so, offer
 * Retry, and keep the way back to the entry list.
 */
export function AtShowScoresheetIdentityUnavailable({ onRetry, onBack }: Props) {
  return (
    <main className="ringside-root flex flex-col items-center justify-center h-96 gap-4 px-4 text-center">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <p className="text-lg font-medium text-destructive">
        We couldn&apos;t confirm your account for this class
      </p>
      <p className="text-muted-foreground max-w-md">
        Check your connection and try again. If it keeps happening, ask the secretary to check your
        judge account.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={onRetry}>Try again</Button>
        <RingsideUpButton label="Entries" onClick={onBack} />
      </div>
    </main>
  );
}
