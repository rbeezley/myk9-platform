/**
 * Static lookups and section configs for the Deleted Items (trash) page: which
 * table or RPC counts each entity type, how each type is labelled, and how each
 * is fetched, restored and permanently deleted.
 */

import { Theater, Trophy, ListChecks, ClipboardList, Dog, Building2, Users } from 'lucide-react';
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/services/LoggingService';
import { getDeletedShows, restoreShow, hardDeleteShow } from '@/services/database/shows';
import { getDeletedTrials, restoreTrial, hardDeleteTrial } from '@/services/database/trials';
import { getDeletedClasses, restoreClass, hardDeleteClass } from '@/services/database/classes';
import { getDeletedEntries, restoreEntry, hardDeleteEntry } from '@/services/database/entries';
import { getDeletedDogs, restoreDog, hardDeleteDog } from '@/services/database/dogs';
import { getDeletedClubs, restoreClub, hardDeleteClub } from '@/services/database/clubs';
import { getDeletedUsers, restoreUser, hardDeleteUser } from '@/services/database/users';
import {
  describeRestoreDog,
  fetchAndMap,
  mapClass,
  mapClub,
  mapDog,
  mapEntry,
  mapPerson,
  mapShow,
  mapTrial,
} from './deletedEntityMappers';
import type { DeletedEntity, EntityType, EntitySectionConfig } from './types';

const TABLE_FOR_TYPE = {
  show: 'shows',
  trial: 'trials',
  class: 'classes',
  entry: 'entries',
  dog: 'dogs',
  club: 'clubs',
  person: 'people',
} as const;

const ENTITY_TYPES = Object.keys(TABLE_FOR_TYPE) as EntityType[];

export function isEntityType(value: string | null): value is EntityType {
  return value !== null && (ENTITY_TYPES as string[]).includes(value);
}

export function emptyCounts(): Record<EntityType, number> {
  return { show: 0, trial: 0, class: 0, entry: 0, dog: 0, club: 0, person: 0 };
}

/*
 * dogs/shows/classes/people hide soft-deleted rows at the RLS layer, so a direct
 * `.from(table).not('deleted_at', ...)` count returns 0 for admins (the section
 * would never render). Count these through the same admin-gated RPC the list
 * reads use; the others (trials/entries/clubs) count fine via a direct head query.
 */
const DELETED_COUNT_RPC: Partial<
  Record<
    EntityType,
    'get_deleted_dogs' | 'get_deleted_shows' | 'get_deleted_classes' | 'get_deleted_people'
  >
> = {
  dog: 'get_deleted_dogs',
  show: 'get_deleted_shows',
  class: 'get_deleted_classes',
  person: 'get_deleted_people',
};

export const ENTITY_LABEL: Record<EntityType, string> = {
  show: 'Show',
  trial: 'Trial',
  class: 'Class',
  entry: 'Entry',
  dog: 'Dog',
  club: 'Club',
  person: 'Person',
};

/** Fetch the deleted-row count for every entity type in parallel. */
export async function fetchDeletedCounts(): Promise<Record<EntityType, number>> {
  const results = await Promise.all(
    ENTITY_TYPES.map(async type => {
      const rpc = DELETED_COUNT_RPC[type];
      if (rpc) {
        // RLS hides these tombstones from direct selects; count via the RPC.
        const { data, error } = await supabase.rpc(rpc);
        if (error) {
          logger.warn(`Failed to fetch deleted count for ${type}`, 'trash', { error });
        }
        return { type, count: data?.length ?? 0 };
      }
      const { count, error } = await supabase
        .from(TABLE_FOR_TYPE[type])
        .select('id', { count: 'exact', head: true })
        .not('deleted_at', 'is', null);
      if (error) {
        logger.warn(`Failed to fetch deleted count for ${type}`, 'trash', { error });
      }
      return { type, count: count ?? 0 };
    })
  );

  const next = emptyCounts();
  for (const { type, count } of results) {
    next[type] = count;
  }
  return next;
}

export const ENTITY_SECTIONS: EntitySectionConfig[] = [
  {
    type: 'show',
    label: 'Shows',
    icon: Theater,
    iconColor: 'text-purple-600',
    fetchDeleted: () => fetchAndMap(getDeletedShows, mapShow),
    restore: restoreShow,
    hardDelete: hardDeleteShow,
  },
  {
    type: 'trial',
    label: 'Trials',
    icon: Trophy,
    iconColor: 'text-amber-600',
    fetchDeleted: () => fetchAndMap(getDeletedTrials, mapTrial),
    restore: restoreTrial,
    hardDelete: hardDeleteTrial,
  },
  {
    type: 'class',
    label: 'Classes',
    icon: ListChecks,
    iconColor: 'text-blue-600',
    fetchDeleted: () => fetchAndMap(getDeletedClasses, mapClass),
    restore: restoreClass,
    hardDelete: hardDeleteClass,
  },
  {
    type: 'entry',
    label: 'Entries',
    icon: ClipboardList,
    iconColor: 'text-green-600',
    fetchDeleted: () => fetchAndMap(getDeletedEntries, mapEntry),
    restore: restoreEntry,
    hardDelete: hardDeleteEntry,
  },
  {
    type: 'dog',
    label: 'Dogs',
    icon: Dog,
    iconColor: 'text-orange-600',
    fetchDeleted: () => fetchAndMap(getDeletedDogs, mapDog),
    restore: restoreDog,
    describeRestore: describeRestoreDog,
    hardDelete: hardDeleteDog,
  },
  {
    type: 'club',
    label: 'Clubs',
    icon: Building2,
    iconColor: 'text-teal-600',
    fetchDeleted: () => fetchAndMap(getDeletedClubs, mapClub),
    restore: restoreClub,
    hardDelete: hardDeleteClub,
  },
  {
    type: 'person',
    label: 'People',
    // The only entity here whose removed record is readable — see
    // EntitySectionConfig.recordHref.
    recordHref: (item: DeletedEntity) => `/people/${item.id}`,
    icon: Users,
    iconColor: 'text-indigo-600',
    fetchDeleted: () => fetchAndMap(getDeletedUsers, mapPerson),
    restore: restoreUser,
    hardDelete: hardDeleteUser,
  },
];
