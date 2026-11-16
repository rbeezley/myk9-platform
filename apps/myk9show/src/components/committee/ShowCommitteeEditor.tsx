/**
 * One show's Event Committee (MYK9-2064). A show uses the club's committee until its secretary
 * changes it here; the show's own list then replaces the club's for this show only, and the
 * club's list is untouched. "Use the club's committee" drops the show's own list.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { notifications } from '@/lib/notifications';
import {
  clearShowCommittee,
  copyClubCommitteeToShow,
  fetchShowCommittee,
} from '@/services/database/club-memberships/committee';
import { CommitteeList } from './CommitteeList';
import { COMMITTEE_QUERY_KEY, useCommittee } from './useCommittee';
import type { User } from '@/types/user-types';

const ALREADY_OWN_MESSAGE = 'This show already has its own committee.';

interface ShowCommitteeEditorProps {
  showId: string;
  people: User[];
}

export function ShowCommitteeEditor({ showId, people }: ShowCommitteeEditorProps) {
  const queryClient = useQueryClient();
  const own = useCommittee({ kind: 'show', showId });

  // What the premium prints today: this show's own list, else the club's.
  const effective = useQuery({
    queryKey: [COMMITTEE_QUERY_KEY, 'effective', showId],
    // A failed read is an error here, never an empty list: null must not read as "none".
    queryFn: async () => {
      const names = await fetchShowCommittee(showId);
      if (!names) throw new Error('Could not read the committee');
      return names;
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [COMMITTEE_QUERY_KEY] });
    void queryClient.invalidateQueries({ queryKey: ['public-show-committee'] });
  };

  const change = useMutation({
    mutationFn: () => copyClubCommitteeToShow(showId),
    onSuccess: refresh,
    onError: error =>
      notifications.error(
        error instanceof Error && error.message === ALREADY_OWN_MESSAGE
          ? ALREADY_OWN_MESSAGE
          : "We couldn't copy the club's committee. Please try again."
      ),
  });

  const switchToClub = useMutation({
    mutationFn: () => clearShowCommittee(showId),
    onSuccess: refresh,
    onError: () =>
      notifications.error("We couldn't switch back to the club's committee. Please try again."),
  });

  if (own.isError) {
    return (
      <p role="status" className="text-sm text-warning">
        We couldn&apos;t load this show&apos;s committee.{' '}
        <button
          type="button"
          onClick={() => void own.refetch()}
          className="underline underline-offset-2"
        >
          Try again
        </button>
      </p>
    );
  }
  if (own.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading the committee...</p>;
  }

  // The show's own rows are the only thing that makes it differ from the club: with none,
  // get_show_committee falls back to the club's list, so that is what prints.
  const hasOwnList = own.members.length > 0;
  const busy = own.busy || change.isPending || switchToClub.isPending;

  return (
    <section className="space-y-3" aria-labelledby="show-committee-heading">
      <div>
        <h3 id="show-committee-heading" className="text-sm font-medium text-foreground">
          Event Committee
        </h3>
        <p className="text-sm text-muted-foreground">
          {hasOwnList
            ? 'This show has its own committee. Changes here do not touch the club’s list.'
            : 'This show prints the club’s committee. Change it only if this show’s committee differs.'}
        </p>
      </div>
      {hasOwnList ? (
        <>
          <CommitteeList
            members={own.members}
            people={people}
            onAdd={own.add}
            onRemove={own.remove}
            onMove={own.move}
            busy={busy}
            emptyText="No committee members yet."
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => switchToClub.mutate()}
          >
            Use the club&apos;s committee
          </Button>
        </>
      ) : (
        <>
          {effective.isError ? (
            <p role="status" className="text-sm text-warning">
              We couldn&apos;t load the club&apos;s committee. This isn&apos;t the same as the club
              having none.{' '}
              <button
                type="button"
                onClick={() => void effective.refetch()}
                className="underline underline-offset-2"
              >
                Try again
              </button>
            </p>
          ) : effective.isLoading || !effective.data ? (
            <p className="text-sm text-muted-foreground">Loading the club&apos;s committee...</p>
          ) : effective.data.length > 0 ? (
            <>
              <ul className="list-disc pl-5 text-sm text-foreground">
                {effective.data.map(name => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => change.mutate()}
              >
                Change for this show
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">The club lists no committee yet.</p>
              <CommitteeList
                members={[]}
                people={people}
                onAdd={own.add}
                onRemove={own.remove}
                onMove={own.move}
                busy={busy}
                emptyText="Add names here to give this show its own committee."
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
