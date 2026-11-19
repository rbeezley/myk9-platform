import { describe, it, expect } from 'vitest';
import {
  acceptsOnlineEntries,
  becomesPublic,
  isPublicShowStatus,
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

  // Codex P2 on #2707: an unknown value (a replica row cached before the
  // column existed) is never online-capable.
  it('reads an unknown switch as not online-capable', () => {
    for (const show of [{}, { onlineEntriesEnabled: null }, null, undefined]) {
      expect(acceptsOnlineEntries(show)).toBe(false);
    }
    expect(acceptsOnlineEntries({ onlineEntriesEnabled: true })).toBe(true);
  });

  it('lists every trigger refusal the sync toast may need to repeat', () => {
    expect(PUBLISH_GATE_MESSAGES).toContain(ONLINE_ENTRIES_BLOCKED_MESSAGE);
    expect(PUBLISH_GATE_MESSAGES).toContain(CLUB_UNAUTHORIZED_MESSAGE);
    expect(new Set(PUBLISH_GATE_MESSAGES).size).toBe(PUBLISH_GATE_MESSAGES.length);
  });
});
