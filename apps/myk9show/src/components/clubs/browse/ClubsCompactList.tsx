import React from 'react';
import { CompactRecordList } from '@/components/layout/CompactRecordList';
import type { Club } from '@/types/club-types';
import { getClubLocation } from './clubsExport';

interface ClubsCompactListProps {
  clubs: Club[];
  /** The club open in the detail pane, if any. */
  selectedId: string | undefined;
  clubShowCounts: Map<string, number>;
  /** The list's filters as a query string (`clubsFilterQuery`), kept on every row's link. */
  filterQuery: string;
}

/** The left pane of the Clubs master-detail layout (see `CompactRecordList`). */
export const ClubsCompactList: React.FC<ClubsCompactListProps> = ({
  clubs,
  selectedId,
  clubShowCounts,
  filterQuery,
}) => (
  <CompactRecordList
    items={clubs}
    selectedId={selectedId}
    label="Clubs"
    getId={club => club.id}
    getHref={club => `/clubs/${club.id}${filterQuery}`}
    getName={club => club.name}
    renderRow={club => {
      const upcoming = clubShowCounts.get(club.id) || 0;
      return {
        title: club.name,
        subtitle: [
          getClubLocation(club),
          upcoming > 0 ? `${upcoming} upcoming show${upcoming === 1 ? '' : 's'}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }}
  />
);
