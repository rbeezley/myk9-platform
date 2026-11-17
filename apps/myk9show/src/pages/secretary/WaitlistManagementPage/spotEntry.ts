import type { WaitlistSpotEntry } from '@/features/waiting-for-you';
import type { WaitlistEntry } from './types';

/** A tab row, as the facts `findOpenWaitlistSpots` reads (the Show Desk pill reads the replica's). */
export function toSpotEntry(entry: WaitlistEntry): WaitlistSpotEntry {
  return {
    id: entry.id,
    classId: entry.class_id,
    dogId: entry.dog_id,
    status: entry.status,
    position: entry.position,
    createdAt: entry.created_at,
    offerExpiresAt: entry.offer_expires_at,
    joinedVia: entry.joined_via,
  };
}

/** The dog's name as the queue shows it. */
export const waitlistDogName = (entry: WaitlistEntry) =>
  entry.dog?.call_name || entry.dog?.name || 'Unknown Dog';
