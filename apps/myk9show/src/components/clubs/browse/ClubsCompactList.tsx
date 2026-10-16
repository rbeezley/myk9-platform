import React from 'react';
import { CompactRecordList } from '@/components/layout/CompactRecordList';
import type { Club } from '@/types/club-types';

interface ClubsCompactListProps {
  clubs: Club[];
  /** The club open in the detail pane, if any. */
  selectedId: string | undefined;
  clubShowCounts: Map<string, number>;
}

/** The left pane of the Clubs master-detail layout (see `CompactRecordList`). */
export const ClubsCompactList: React.FC<ClubsCompactListProps> = ({
  clubs,
  selectedId,
  clubShowCounts,
}) => (
  <CompactRecordList
    items={clubs}
    selectedId={selectedId}
    label="Clubs"
    getId={club => club.id}
    getHref={club => `/clubs/${club.id}`}
    getName={club => club.name}
    renderRow={club => {
      const upcoming = clubShowCounts.get(club.id) || 0;
      return {
        title: club.name,
        subtitle: [
          [club.address?.city, club.address?.state].filter(Boolean).join(', '),
          upcoming > 0 ? `${upcoming} upcoming show${upcoming === 1 ? '' : 's'}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }}
  />
);
