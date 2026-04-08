/**
 * Waitlist Mappers
 *
 * Maps replicated waitlist entry data + joined dog/class data
 * into the composite shapes expected by waitlistQueries consumers.
 */

import type { ReplicatedWaitlistEntry } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import type {
  WaitlistEntry,
  ClassWithWaitlistCount,
} from '@/services/database/queries/waitlistQueries';

/**
 * Map a ReplicatedWaitlistEntry + joined dog/class into the WaitlistEntry shape
 * expected by the original PostgREST query consumers.
 */
export function mapWaitlistEntry(
  entry: ReplicatedWaitlistEntry,
  dog: ReplicatedDog | null,
  cls: ReplicatedClass | null
): WaitlistEntry {
  return {
    id: entry.id,
    class_id: entry.classId,
    dog_id: entry.dogId,
    exhibitor_id: entry.exhibitorId ?? '',
    handler_id: entry.handlerId ?? null,
    position: entry.position,
    status: entry.status,
    offered_at: entry.offeredAt ?? null,
    offer_expires_at: entry.offerExpiresAt ?? null,
    created_at: entry.createdAt ?? null,
    updated_at: entry.updatedAt ?? null,
    dog: dog
      ? {
          id: dog.id,
          name: dog.name,
          call_name: dog.callName ?? null,
        }
      : null,
    class: cls
      ? {
          id: cls.id,
          name: cls.name,
          class_number: null, // ReplicatedClass does not have classNumber
          max_entries: cls.maxEntries ?? null,
        }
      : null,
  };
}

/**
 * Map a ReplicatedClass + trial + counts into the ClassWithWaitlistCount shape
 * expected by the original PostgREST query consumers.
 */
export function mapClassWithWaitlistCount(
  cls: ReplicatedClass,
  trial: ReplicatedTrial | null,
  acceptedCount: number,
  waitlistCount: number
): ClassWithWaitlistCount {
  return {
    id: cls.id,
    name: cls.name,
    class_number: null, // ReplicatedClass does not have classNumber
    max_entries: cls.maxEntries ?? null,
    trial_id: cls.trialId ?? '',
    trial: trial
      ? {
          id: trial.id,
          name: trial.name ?? null,
          date: trial.date ?? null,
        }
      : null,
    accepted_count: acceptedCount,
    waitlist_count: waitlistCount,
  };
}
