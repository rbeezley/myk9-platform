/**
 * The picker's non-list states (load error, no judge assignments, no classes),
 * split out of AtShowClassListPage so the page stays under the file-size ceiling.
 */
import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClassListUpAndMenu } from './ClassListUpAndMenu';

interface ScreenProps {
  showId: string | undefined;
  clubId: string | undefined;
  /** The readiness action; rendered in every branch (MYK9-203). */
  readySlot: ReactNode;
}

export function AtShowClassListErrorScreen({
  showId,
  clubId,
  readySlot,
  onRetry,
}: ScreenProps & { onRetry: () => void }) {
  return (
    <main className="ringside-root flex min-h-96 flex-col items-center justify-center gap-3 px-4 text-center">
      <AlertCircle className="h-12 w-12 text-destructive" aria-hidden />
      <h1 className="text-lg font-medium text-destructive">Failed to load classes</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The class list could not be read on this device. Try again, and if it keeps failing ask the
        secretary to check this show.
      </p>
      {readySlot}
      <div className="flex w-full max-w-xs flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center">
        <Button variant="outline" className="min-h-11 px-6" onClick={onRetry}>
          Try again
        </Button>
        <ClassListUpAndMenu showId={showId} clubId={clubId} />
      </div>
    </main>
  );
}

export function AtShowClassListNoAssignmentsScreen({
  readySlot,
  assignmentError,
  onRetry,
  onBack,
}: Pick<ScreenProps, 'readySlot'> & {
  assignmentError: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <main className="ringside-root flex min-h-96 flex-col items-center justify-center gap-3 px-4 text-center">
      <AlertCircle className="h-12 w-12 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-medium">
        {assignmentError ? "We couldn't load your judge assignments" : 'No classes assigned yet'}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {assignmentError
          ? 'Check your connection and try again. Your classes will appear here once assignments are available.'
          : 'Your secretary has not assigned you to a class for this show yet. Ask them to add your judge assignment.'}
      </p>
      {readySlot}
      <div className="flex flex-col gap-2 sm:flex-row">
        {assignmentError && (
          <Button variant="outline" className="min-h-11" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button className="min-h-11" onClick={onBack}>
          Back to Judge Dashboard
        </Button>
      </div>
    </main>
  );
}

export function AtShowClassListEmptyScreen({
  showId,
  clubId,
  readySlot,
  neverReachedDevice,
  syncFailed,
  onRetry,
}: ScreenProps & { neverReachedDevice: boolean; syncFailed: boolean; onRetry: () => void }) {
  return (
    <main className="ringside-root flex min-h-96 flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-medium">
        {neverReachedDevice ? 'Classes not on this device yet' : 'No classes'}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {!neverReachedDevice
          ? 'This show has no classes yet.'
          : syncFailed
            ? "This show's classes could not be loaded onto this device. Try again, and if it keeps failing move somewhere with a better signal."
            : "This device hasn't downloaded this show's classes, and there's no connection to fetch them now. Reconnect once and they'll be here for the rest of the day."}
      </p>
      {/* The branch a cold replica lands in is exactly the branch where
          priming helps most, so the readiness action belongs here too. */}
      {readySlot}
      <div className="flex w-full max-w-xs flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center">
        {neverReachedDevice && (
          <Button variant="outline" className="min-h-11 px-6" onClick={onRetry}>
            Try again
          </Button>
        )}
        <ClassListUpAndMenu showId={showId} clubId={clubId} />
      </div>
    </main>
  );
}
