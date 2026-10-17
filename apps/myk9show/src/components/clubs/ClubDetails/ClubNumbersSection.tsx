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
 * MYK9-1235: the club's AKC / UKC / ASCA numbers, read-only, with an Edit button for
 * people who can edit the club. They are online-only data, so they live here and not in
 * the Edit Club panel (which saves offline-first).
 */
export const ClubNumbersSection: React.FC<ClubNumbersSectionProps> = ({ clubId, canEdit }) => {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useClubRegistryNumbers(clubId);
  const label = formatClubRegistryNumbers(data);

  // A visitor with nothing to read and nothing to edit sees no section at all.
  if (!canEdit && !label) return null;

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
            <button type="button" className="underline" onClick={() => void refetch()}>
              Retry
            </button>
          </span>
        ) : label ? (
          <span>{label}</span>
        ) : (
          <span className="text-muted-foreground">None yet</span>
        )}
      </div>
      {canEdit && (
        <>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setOpen(true)}
          >
            Edit
          </Button>
          <ClubNumbersDialog open={open} onOpenChange={setOpen} clubId={clubId} />
        </>
      )}
    </section>
  );
};
