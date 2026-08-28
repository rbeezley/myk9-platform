/**
 * Regression test for impeccable p2 audit finding H4.
 *
 * `useShowPaperworkPrints` exposes `syncFailed` for one specific reason, stated
 * in its own comment: its `useQuery` reads IndexedDB, so it SUCCEEDS even when
 * the server read did not, and `sync()` resolves with `{ success: false }`
 * rather than rejecting. `isError` is therefore effectively always false, and a
 * caller asking "could I load the confirmations?" got a confident yes over an
 * empty list. The comment calls this "the difference between 'nothing is
 * printed' and 'I could not find out' (MYK9-228)".
 *
 * The Reports page consumes that flag. The Show Desk dropped it, so check-in
 * sheets printed an hour ago on another device rendered "Not confirmed printed"
 * with a Print button, inviting a duplicate print run mid-show.
 *
 * As with the entry counts on this page, the truthful state already existed:
 * `SecretaryCockpitPaperwork['state']` has always declared `'unknown'` and
 * `paperworkEvidence` already maps it to an `unknown` evidence kind. Nothing
 * could produce it.
 */

import { describe, it, expect } from 'vitest';
import { buildClassPaperworkMap } from '../buildClassPaperworkMap';
import type { DbClass, DbEntry } from '@/types/database-mappings';

const CLASSES = [
  { id: 'class-1', trial_id: 'trial-1', name: 'Container Novice' },
] as unknown as DbClass[];

const ENTRIES = [{ id: 'entry-1', class_id: 'class-1', armband: '12' }] as unknown as DbEntry[];

function build(recordsUnavailable: boolean) {
  return buildClassPaperworkMap({
    showId: 'show-1',
    classes: CLASSES,
    trials: [{ id: 'trial-1', trialDate: '2026-08-28' }],
    entries: ENTRIES,
    records: [],
    recordsUnavailable,
    returnTo: '/shows/show-1/show-desk',
  });
}

describe('buildClassPaperworkMap — unreadable print records (audit H4)', () => {
  it('reports every paperwork item as unknown when the sync failed', () => {
    const paperwork = build(true).get('class-1') ?? [];

    expect(paperwork.length).toBeGreaterThan(0);
    for (const item of paperwork) {
      expect(item.state).toBe('unknown');
    }
  });

  it('never claims "unconfirmed" from records it could not read', () => {
    const paperwork = build(true).get('class-1') ?? [];

    // "unconfirmed" is a claim about the world: nobody printed this. It is the
    // one thing an unread record set cannot support, and it is what put a
    // Print button in front of a secretary who had already printed.
    expect(paperwork.map(item => item.state)).not.toContain('unconfirmed');
  });

  it('still reports unconfirmed when the records genuinely loaded and were empty', () => {
    const paperwork = build(false).get('class-1') ?? [];

    expect(paperwork.length).toBeGreaterThan(0);
    expect(paperwork.map(item => item.state)).toContain('unconfirmed');
  });
});
