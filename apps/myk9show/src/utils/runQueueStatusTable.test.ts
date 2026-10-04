import { describe, expect, it } from 'vitest';
import { CHECKIN_STATUSES } from '@myk9/core';
import { isInQueue } from '@myk9/ringside/run-queue';
import { ENTRY_LIFECYCLE_STATUS_VALUES } from '@/types/entry-lifecycle';

// MYK9-992/996: queue membership is an allowlist. This pins a decision for
// EVERY status either axis can carry, so adding one to @myk9/core or the
// lifecycle list fails here until someone decides whether it is "still to run".
const STILL_TO_RUN = new Set<string>([
  'no-status',
  'checked-in',
  'at-gate',
  'come-to-gate',
  'conflict',
  'in-ring',
  'draft',
  'submitted',
  'paid',
  'confirmed',
  'scheduled',
  'pending-payment',
  'promotion-expired',
  'move-up-requested',
  'move_up_requested',
  'competing',
]);
const OUT_OF_QUEUE = new Set<string>([
  'pulled',
  'completed',
  'withdrawn',
  'scratched',
  'absent',
  'moved',
  'not_accepted',
]);

describe('run queue membership decides every known status', () => {
  const every = [...new Set<string>([...CHECKIN_STATUSES, ...ENTRY_LIFECYCLE_STATUS_VALUES])];

  it.each(every)('%s is decided', status => {
    expect(STILL_TO_RUN.has(status) || OUT_OF_QUEUE.has(status)).toBe(true);
    expect(isInQueue({ id: 'x', armband: 1, status })).toBe(STILL_TO_RUN.has(status));
  });
});
