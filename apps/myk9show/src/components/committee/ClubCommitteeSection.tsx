/**
 * The club's Event Committee (MYK9-2064), under the Officers list. AKC Ch. 3 §15 asks for at
 * least five names including the Chair. Every show uses this list unless its secretary changes
 * the committee for that one show (Edit show > Personnel).
 */

import { CommitteeList } from './CommitteeList';
import { useCommittee } from './useCommittee';
import type { User } from '@/types/user-types';

interface ClubCommitteeSectionProps {
  clubId: string;
  people: User[];
}

export function ClubCommitteeSection({ clubId, people }: ClubCommitteeSectionProps) {
  const committee = useCommittee({ kind: 'club', clubId });

  return (
    <section className="space-y-3 pt-2" aria-labelledby="club-committee-heading">
      <div>
        <h3 id="club-committee-heading" className="text-base font-semibold text-foreground">
          Event Committee
        </h3>
        <p className="text-sm text-muted-foreground">
          Printed in every premium list. AKC asks for at least five names, including the Chair. A
          secretary can change it for one show without changing this list.
        </p>
      </div>
      {committee.isError ? (
        <p
          role="status"
          className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          We couldn&apos;t load the committee. This isn&apos;t the same as the club having none.{' '}
          <button
            type="button"
            onClick={() => void committee.refetch()}
            className="underline underline-offset-2"
          >
            Try again
          </button>
        </p>
      ) : (
        <CommitteeList
          members={committee.members}
          people={people}
          onAdd={committee.add}
          onRemove={committee.remove}
          onMove={committee.move}
          busy={committee.busy || committee.isLoading}
          emptyText="No committee members yet."
        />
      )}
    </section>
  );
}
