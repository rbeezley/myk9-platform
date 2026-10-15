import { describe, expect, it, vi } from 'vitest';

const { transitionToInRing } = vi.hoisted(() => ({ transitionToInRing: vi.fn() }));
vi.mock('@/utils/checkInTransitions', () => ({ transitionToInRing }));

import { moveInRing } from './moveInRing';

describe('moveInRing', () => {
  // MYK9-1169: the transition reads the entry's OWN status and ring entry time,
  // so a dog already in-ring keeps its original ring_entry_time.
  it("passes the entry's own status and ring entry time to the in-ring transition", () => {
    moveInRing({
      id: 'entry-1',
      checkInStatus: 'in-ring',
      ring_entry_time: '2026-10-14T18:00:00.000Z',
    } as never);

    expect(transitionToInRing).toHaveBeenCalledWith(
      'entry-1',
      'in-ring',
      '2026-10-14T18:00:00.000Z'
    );
  });
});
