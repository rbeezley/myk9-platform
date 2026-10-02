/**
 * State Components for ClassDetailsPage
 *
 * Renders different UI states: not found, empty, loading
 */

import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { Plus, ArrowLeft } from 'lucide-react';
import { PageShell } from '@/components/common/PageShell';
import { ErrorState } from '@/components/common/ErrorState';
import { NotFoundState } from '@/components/common/NotFoundState';

/**
 * Shown when the requested class doesn't exist (or a guest may not see it).
 * The shared not-found state, whose one button is the parent: the trial when the
 * URL names one, else the show, else the shows list. `/classes` is not a list page.
 */
export function ClassNotFoundState({
  showId,
  trialId,
}: {
  showId?: string | undefined;
  trialId?: string | undefined;
}) {
  const target = trialId
    ? { backTo: `/trials/${trialId}`, backLabel: 'Back to Trial' }
    : showId
      ? { backTo: `/shows/${showId}`, backLabel: 'Back to Show' }
      : { backTo: '/shows', backLabel: 'Back to Shows' };

  return (
    <PageShell>
      <NotFoundState entityName="Class" {...target} />
    </PageShell>
  );
}

/**
 * Shown when there are no classes in the system
 */
export function EmptyClassState() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-background">
      <div className="w-80 border-r border-border bg-card">
        <div className="p-4">
          <div className="text-sm text-muted-foreground">No classes found</div>
        </div>
      </div>
      <main className="flex-1 overflow-auto">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">No Classes Available</h1>
            <p className="text-muted-foreground mb-6">
              Classes are created within trials. Start by creating a show and adding trials with
              classes.
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => navigate('/shows')}
                variant="outline"
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Go to Shows
              </Button>
              <Button
                onClick={() => navigate('/secretary/create-show/wizard')}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Show
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Shown while class data is loading
 */
export function LoadingClassState() {
  return (
    <div
      role="status"
      aria-label="Loading class details"
      className="flex min-h-screen bg-background"
    >
      <div className="w-80 border-r border-border bg-card">
        <div className="space-y-3 p-4">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-12 rounded-lg" />
          ))}
        </div>
      </div>
      <main className="flex-1 overflow-auto">
        <div className="space-y-6 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-lg" />
            ))}
          </div>
          <div className="rounded-lg border bg-card p-6">
            <Skeleton className="mb-4 h-6 w-40" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-5 w-full" />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export const GUEST_CLASS_OFFLINE_MESSAGE =
  "You're offline. Connect to the internet to see these results.";

/**
 * MYK9-785: a signed-out guest's class is read online only, so offline and a
 * failed read are states of their own, never a cached class.
 */
export function GuestClassUnavailableState({
  offline,
  onRetry,
}: {
  offline: boolean;
  onRetry: () => void;
}) {
  return (
    <PageShell>
      <ErrorState
        message={
          offline ? GUEST_CLASS_OFFLINE_MESSAGE : "We couldn't load this class. Please try again."
        }
        onRetry={onRetry}
        headingLevel={1}
      />
    </PageShell>
  );
}

/** A class anon may not see in this show. Links back to the public show page. */
export function GuestClassNotFoundState({ showId }: { showId: string | undefined }) {
  return <ClassNotFoundState showId={showId} />;
}
