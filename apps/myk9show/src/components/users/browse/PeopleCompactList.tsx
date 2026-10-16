import React from 'react';
import { CompactRecordList } from '@/components/layout/CompactRecordList';
import { extractPersonName } from '@/components/users/UserDetails/userDetailsTypes';
import type { User } from '@/types/user-types';

interface PeopleCompactListProps {
  people: User[];
  /** The person open in the detail pane, if any. */
  selectedId: string | undefined;
  /** The list's filters as a query string (`filtersQueryString`), kept on every row's link. */
  filterQuery?: string;
}

const fullName = (person: User) => extractPersonName(person).fullName;

/** The left pane of the People master-detail layout (see `CompactRecordList`). */
export const PeopleCompactList: React.FC<PeopleCompactListProps> = ({
  people,
  selectedId,
  filterQuery = '',
}) => (
  <CompactRecordList
    items={people}
    selectedId={selectedId}
    label="People"
    getId={person => person.id}
    getHref={person => `/people/${person.id}${filterQuery}`}
    getName={fullName}
    renderRow={person => ({
      title: fullName(person),
      subtitle: [person.email, (person.roles ?? []).join(', ')].filter(Boolean).join(' · '),
    })}
  />
);
