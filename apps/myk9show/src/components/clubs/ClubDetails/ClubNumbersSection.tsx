import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useClubRegistryNumbers } from '@/hooks/queries/useClubRegistryNumbers';
import { formatClubRegistryNumbers } from '@/utils/clubRegistryNumbers';
import { ClubNumbersDialog } from './ClubNumbersDialog';

interface ClubNumbersSectionProps {
  clubId: string;
  /** Same permission as Edit Club (`canEditClub`). */
  canEdit: boolean;
}

/**
 * MYK9-1235: the Edit control for the club's AKC / UKC / ASCA numbers, for people who can
 * edit the club. The numbers themselves are shown once, in ClubHeader's facts line; this
 * section only adds the edit affordance and the states that line has no room for
 * (none yet, loading, a failed read with Retry). The numbers are online-only data, so
 * they are edited here and not in the Edit Club panel (which saves offline-first).
 */
export const ClubNumbersSection: React.FC<ClubNumbersSectionProps> = ({ clubId, canEdit }) => {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useClubRegistryNumbers(clubId);
  const hasNumbers = Boolean(formatClubRegistryNumbers(data));
  // No data that is neither loading nor an error is a paused (offline) read, never
  // proof the club has no numbers ("None yet" only after a real empty answer).
  const notLoaded = data === undefined && !isLoading && !isError;

  // Visitors read the numbers in the header; there is nothing here for them.
  if (!canEdit) return null;

  return (
    <section
      aria-label="Club numbers"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
    >
      <div className="text-sm">
        <span className="font-medium">Club numbers: </span>
        {isLoading ? (
          <span className="text-muted-foreground">Loading…</span>
        ) : isError ? (
          <span className="text-muted-foreground">
            Couldn&apos;t load.{' '}
            <Button
              type="button"
              variant="outline"
              className="ml-1 min-h-11 min-w-11"
              onClick={() => void refetch()}
            >
              Retry
            </Button>
          </span>
        ) : notLoaded ? (
          <span className="text-muted-foreground">Need a connection to load.</span>
        ) : hasNumbers ? (
          <span className="text-muted-foreground">AKC, UKC and ASCA</span>
        ) : (
          <span className="text-muted-foreground">None yet</span>
        )}
      </div>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <ClubNumbersDialog open={open} onOpenChange={setOpen} clubId={clubId} />
    </section>
  );
};
