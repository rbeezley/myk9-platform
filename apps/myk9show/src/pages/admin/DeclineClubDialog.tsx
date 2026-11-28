import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CLUB_ACCESS_SENTENCE } from '@/features/delete/deleteObjectCopy';
import { useShowsByClubQuery } from '@/hooks/queries/useShowsDatabase';

interface DeclineClubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubName: string;
  /** Null for a legacy request whose club was never created: nothing to delete. */
  clubId: string | null;
  /** Where the reason starts (the card's Review note). The dialog edits its own copy. */
  initialNote: string;
  busy: boolean;
  /** The reason leaves the dialog only here; Cancel discards it. */
  onConfirm: (deleteClub: boolean, note: string) => void;
}

/**
 * MYK9-2528 (owner decision 2026-11-27, "Offer delete in Decline"): Decline is one
 * confirmation that carries the reason and an "Also delete this club" box, so declining and
 * removing a club nobody wants is 2 clicks on one screen. The box starts ticked. A club with
 * shows cannot be deleted (the server refuses with MK011), so the box is off and says why,
 * with a link to the club's shows; the decline itself still goes ahead.
 *
 * The shows count is read from the shows the app already holds, not a new server call.
 */
export function DeclineClubDialog({ clubId, ...props }: DeclineClubDialogProps) {
  // Mounted only while open, so the shows are read only when someone is declining.
  if (!props.open) return null;
  return <DeclineClubDialogBody clubId={clubId} {...props} />;
}

function DeclineClubDialogBody({
  open,
  onOpenChange,
  clubName,
  clubId,
  initialNote,
  busy,
  onConfirm,
}: DeclineClubDialogProps) {
  const [note, setNote] = useState(initialNote);
  const showsQuery = useShowsByClubQuery(clubId ?? '');
  const [deleteClub, setDeleteClub] = useState(true);
  const showCount = showsQuery.data?.length ?? 0;
  const checking = clubId !== null && showsQuery.isPending;
  const checkFailed = clubId !== null && showsQuery.isError;
  const hasShows = showCount > 0;
  const canDelete = clubId !== null && !checking && !checkFailed && !hasShows;

  return (
    <Dialog open={open} onOpenChange={next => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Decline {clubName}?</DialogTitle>
          <DialogDescription>
            The person who asked is told the request was declined, with your reason if you write
            one.
          </DialogDescription>
        </DialogHeader>
        <label className="block text-sm font-medium">
          Reason (optional)
          <Input
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder="Optional note for the requester"
            className="mt-1 min-h-11"
          />
        </label>
        {clubId !== null && (
          <div className="flex items-start gap-3">
            <Checkbox
              id="decline-delete-club"
              checked={canDelete && deleteClub}
              disabled={!canDelete || busy}
              onCheckedChange={setDeleteClub}
              className="mt-1"
            />
            <div className="text-sm">
              <label htmlFor="decline-delete-club" className="font-medium">
                Also delete this club
              </label>
              {canDelete && <p className="text-muted-foreground">{CLUB_ACCESS_SENTENCE}</p>}
              {checking && <p className="text-muted-foreground">Checking for shows…</p>}
              {checkFailed && (
                <p className="text-muted-foreground">
                  We couldn&apos;t check whether this club has shows, so it can&apos;t be deleted
                  here.
                </p>
              )}
              {hasShows && (
                <p className="text-muted-foreground">
                  This club has {showCount === 1 ? '1 show' : `${showCount} shows`}, so it
                  can&apos;t be deleted.{' '}
                  <Link
                    to={`/clubs/${clubId}`}
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    See its shows
                  </Link>
                </p>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            loading={busy}
            disabled={busy || checking}
            onClick={() => onConfirm(canDelete && deleteClub, note)}
          >
            Decline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
