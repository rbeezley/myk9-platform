import { describe, it, expect } from 'vitest';
import {
  becomesPublic,
  isMailInOnlyShow,
  isPublicShowStatus,
  publishNeedsStripe,
  PUBLIC_SHOW_STATUSES,
  PUBLISH_GATE_MESSAGES,
  ONLINE_ENTRIES_BLOCKED_MESSAGE,
  CLUB_UNAUTHORIZED_MESSAGE,
} from '../onlineEntryGate';

// MYK9-979: the client mirror of enforce_show_publish_gate's rule.
describe('online entries switch — client mirror of the publish gate', () => {
  it('treats exactly the shows_anon_select statuses as public', () => {
    expect([...PUBLIC_SHOW_STATUSES]).toEqual([
      'published',
      'upcoming',
      'in_progress',
      'completed',
    ]);
    for (const status of PUBLIC_SHOW_STATUSES) expect(isPublicShowStatus(status)).toBe(true);
    for (const status of ['draft', 'cancelled', '', null, undefined]) {
      expect(isPublicShowStatus(status)).toBe(false);
    }
  });

  it('gates every move from a non-public status into a public one, and no other', () => {
    for (const to of PUBLIC_SHOW_STATUSES) {
      expect(becomesPublic('draft', to)).toBe(true);
      expect(becomesPublic('cancelled', to)).toBe(true);
      expect(becomesPublic(undefined, to)).toBe(true);
    }
    expect(becomesPublic('upcoming', 'published')).toBe(false);
    expect(becomesPublic('published', 'in_progress')).toBe(false);
    expect(becomesPublic('published', 'draft')).toBe(false);
    expect(becomesPublic('draft', 'cancelled')).toBe(false);
  });

  it('needs Stripe payouts to publish only when online entries are on', () => {
    expect(publishNeedsStripe(true)).toBe(true);
    expect(publishNeedsStripe(false)).toBe(false);
    // Unknown is not "on": the trigger reads the stored value, which is
    // NOT NULL, so the client never blocks on a value it cannot see.
    expect(publishNeedsStripe(undefined)).toBe(false);
    expect(publishNeedsStripe(null)).toBe(false);
  });

  it('reads a show as mail-in only when the switch is explicitly off', () => {
    expect(isMailInOnlyShow({ onlineEntriesEnabled: false })).toBe(true);
    expect(isMailInOnlyShow({ onlineEntriesEnabled: true })).toBe(false);
    expect(isMailInOnlyShow({})).toBe(false);
    expect(isMailInOnlyShow(null)).toBe(false);
  });

  it('lists every trigger refusal the sync toast may need to repeat', () => {
    expect(PUBLISH_GATE_MESSAGES).toContain(ONLINE_ENTRIES_BLOCKED_MESSAGE);
    expect(PUBLISH_GATE_MESSAGES).toContain(CLUB_UNAUTHORIZED_MESSAGE);
    expect(new Set(PUBLISH_GATE_MESSAGES).size).toBe(PUBLISH_GATE_MESSAGES.length);
  });
});
