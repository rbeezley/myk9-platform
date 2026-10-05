import React from 'react';
import { CompactRecordList } from '@/components/layout/CompactRecordList';
import type { Dog } from '@/types/dog-types';
import { getDogCardFacts } from './dogCardFacts';

interface DogsCompactListProps {
  dogs: Dog[];
  /** The dog open in the detail pane, if any. */
  selectedId: string | undefined;
  /** False on an own-dogs-only roster, where an owner line only repeats the viewer's name. */
  showOwner?: boolean;
}

const displayName = (dog: Dog) => dog.callName || dog.name;

/** The left pane of the Dogs master-detail layout (see `CompactRecordList`). */
export const DogsCompactList: React.FC<DogsCompactListProps> = ({
  dogs,
  selectedId,
  showOwner = true,
}) => (
  <CompactRecordList
    items={dogs}
    selectedId={selectedId}
    label="Dogs"
    getId={dog => dog.id}
    getHref={dog => `/dogs/${dog.id}`}
    getName={displayName}
    renderRow={dog => ({
      title: displayName(dog),
      subtitle: getDogCardFacts(dog, { showOwner })
        .filter(fact => fact.kind !== 'age')
        .map(fact => fact.text)
        .join(' · '),
    })}
  />
);
