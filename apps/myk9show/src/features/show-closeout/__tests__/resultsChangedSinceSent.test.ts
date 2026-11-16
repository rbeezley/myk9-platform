import { describe, expect, it } from 'vitest';

import { buildFinishList } from '../finishList';
import { calculateWhatIsLeft, type ScoreChangeRead } from '../whatIsLeft';

const SENT_AT = '2026-11-14T19:40:00Z';
const BEFORE = '2026-11-14T19:00:00Z';
const AFTER = '2026-11-14T20:15:00Z';

const read = (changes: Record<string, string>): ScoreChangeRead => ({
  status: 'read',
  latestByClass: new Map(Object.entries(changes)),
});

function leftFor(
  scoreChanges: ScoreChangeRead | undefined,
  submissions: { status: string; organization: string; submitted_at: string }[] = [
    { status: 'sent', organization: 'AKC', submitted_at: SENT_AT },
  ]
) {
  return calculateWhatIsLeft({
    classes: [
      { id: 'c1', trialId: 't1', expectedCount: 4, scoredCount: 4 },
      { id: 'c2', trialId: 't1', expectedCount: 4, scoredCount: 4 },
    ],
    trials: [{ id: 't1', registryId: 'AKC' }],
    entries: [],
    incidents: null,
    submissions,
    scoreChanges,
  });
}

function listFor(...args: Parameters<typeof leftFor>) {
  return buildFinishList('show-1', leftFor(...args)).find(item => item.key === 'akc-results-file');
}

describe('the results file line after a score changes', () => {
  it('a change after the send flips the line and offers the send again', () => {
    const item = listFor(read({ c2: AFTER }));
    expect(item).toMatchObject({
      state: 'open',
      label: 'Results changed since they were sent',
      href: '/shows/show-1/results?step=submit&reason=changed',
    });
  });

  it('a change before the send leaves the line ticked as sent', () => {
    const item = listFor(read({ c1: BEFORE }));
    expect(item).toMatchObject({ state: 'done', label: 'Results file sent to AKC', href: null });
    expect(item?.note).toBeUndefined();
  });

  it('a resend newer than the change clears it, and the first record stays', () => {
    const records = [
      { status: 'sent', organization: 'AKC', submitted_at: SENT_AT },
      { status: 'sent', organization: 'AKC', submitted_at: '2026-11-14T21:00:00Z' },
    ];
    const item = listFor(read({ c2: AFTER }), records);
    expect(item).toMatchObject({ state: 'done', label: 'Results file sent to AKC' });
  });

  it('says plainly when the history could not be read', () => {
    const item = listFor({ status: 'unreadable' });
    expect(item).toMatchObject({ state: 'done', label: 'Results file sent to AKC' });
    expect(item?.note).toBe('We could not check for score changes since they were sent.');
  });

  it('does not tick the line while the history is still loading', () => {
    expect(listFor({ status: 'loading' })).toMatchObject({
      state: 'unknown',
      note: 'Checking for score changes since the file was sent.',
    });
  });

  it('says nothing extra when the caller does not look', () => {
    expect(listFor(undefined)?.note).toBeUndefined();
  });

  it('counts a later "submitted" record for that registry as handling the change', () => {
    const item = listFor(read({ c2: AFTER }), [
      { status: 'sent', organization: 'AKC', submitted_at: SENT_AT },
      { status: 'submitted', organization: 'AKC', submitted_at: '2026-11-14T22:00:00Z' },
    ]);
    expect(item).toMatchObject({ state: 'done', label: 'Results file sent to AKC' });
  });

  it('links the changed line to the send with the reason', () => {
    expect(listFor(read({ c2: AFTER }))?.href).toBe(
      '/shows/show-1/results?step=submit&reason=changed'
    );
  });

  describe('the close step reads the same answer', () => {
    const concerns = (changes: ScoreChangeRead | undefined) => leftFor(changes).concerns;

    it('warns to send again when scores changed', () => {
      expect(concerns(read({ c2: AFTER }))).toContain(
        'Scores changed after the results file was sent. Send it again before closing.'
      );
    });

    it('warns it could not check when the history is unreadable', () => {
      expect(concerns({ status: 'unreadable' })).toContain(
        'Could not check whether scores changed after the results file was sent.'
      );
    });

    it('adds nothing when the file is current, loading or not looked at', () => {
      for (const state of [read({ c1: BEFORE }), { status: 'loading' } as const, undefined]) {
        expect(concerns(state).join(' ')).not.toMatch(/results file was sent/);
      }
    });
  });

  it('ignores a file the secretary only marked as submitted', () => {
    const item = listFor(read({ c2: AFTER }), [
      { status: 'submitted', organization: 'AKC', submitted_at: SENT_AT },
    ]);
    expect(item).toMatchObject({ state: 'done', label: 'Results file sent to AKC' });
  });
});
