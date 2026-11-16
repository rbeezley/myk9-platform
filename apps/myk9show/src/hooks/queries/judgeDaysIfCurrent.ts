import type { JudgeDayCapacity } from '@/types/waitlist-types';

/**
 * The judge-day figures, only when they are current: read successfully, not parked offline, not a
 * failed re-read keeping an old answer, and the device is online. Anything else is `null`
 * ("unknown"), which `findOpenWaitlistSpots` never turns into an open spot. The Waitlist page
 * and the Show Desk pill both ask through here, so they agree.
 */
export function judgeDaysIfCurrent(
  capacity: {
    judgeDays: JudgeDayCapacity[];
    isKnown?: boolean | undefined;
    isPaused?: boolean | undefined;
    error?: string | null | undefined;
  },
  isOnline: boolean
): JudgeDayCapacity[] | null {
  const current =
    capacity.isKnown === true &&
    !capacity.isPaused &&
    !capacity.error &&
    isOnline &&
    (typeof navigator === 'undefined' || navigator.onLine !== false);
  return current ? capacity.judgeDays : null;
}
