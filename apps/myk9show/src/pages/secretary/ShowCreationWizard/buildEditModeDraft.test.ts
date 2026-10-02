import { describe, expect, it } from 'vitest';
import type { Show } from '@/types/show-types';
import { buildEditModeDraft } from './buildEditModeDraft';

const show = (assignedJudges: Array<{ judgeId: string; judgeName: string }>) =>
  ({
    id: 'show-1',
    name: 'Heartland',
    organization: 'AKC',
    startDate: '2026-10-10',
    endDate: '2026-10-11',
    location: 'Venue',
    clubId: 'club-1',
    entryOpenDate: '2026-09-01',
    entryCloseDate: '2026-10-01',
    preEntryFee: '30',
    dayOfShowFee: '35',
    assignedJudges,
  }) as unknown as Show;

// MYK9-772: the wizard saves judges as the difference from the list its draft
// was built from. The baseline must be recorded HERE, at build time — the live
// store can gain judges later, and a save diffed against those would turn
// judges the draft never showed into removals.
describe('buildEditModeDraft judge baseline', () => {
  it('records the judge ids the draft starts from', () => {
    const draft = buildEditModeDraft({
      editMode: { showId: 'show-1', mode: 'edit-show' } as never,
      existingShow: show([
        { judgeId: 'a', judgeName: 'A' },
        { judgeId: 'b', judgeName: 'B' },
      ]),
      showTrials: [],
      existingClasses: [],
      people: [],
    });
    expect(draft.editBaselineJudgeIds).toEqual(['a', 'b']);
    expect(draft.show.judgeIds).toEqual(['a', 'b']);
  });

  it('records an empty baseline for a show that loaded with no judges', () => {
    const draft = buildEditModeDraft({
      editMode: { showId: 'show-1', mode: 'add-trials' } as never,
      existingShow: show([]),
      showTrials: [],
      existingClasses: [],
      people: [],
    });
    expect(draft.editBaselineJudgeIds).toEqual([]);
  });
});

/**
 * MYK9-831 (Codex review, PR #2543): `loadDraft` replaces the whole `show`
 * object rather than merging it, so an edit-mode draft that omitted timezone
 * wiped out whatever the wizard already held. In add-trials mode especially —
 * which starts from an empty trial list — a new trial then took the editing
 * secretary's browser zone instead of the show's own established one.
 */
describe('buildEditModeDraft timezone', () => {
  it('carries the existing show timezone into the draft (edit-show mode)', () => {
    const draft = buildEditModeDraft({
      editMode: { showId: 'show-1', mode: 'edit-show' } as never,
      existingShow: show([]),
      showTrials: [{ id: 'trial-1', timezone: 'America/Chicago' } as never],
      existingClasses: [],
      people: [],
    });
    expect(draft.show.timezone).toBe('America/Chicago');
  });

  it('carries the existing show timezone into the draft even in add-trials mode', () => {
    // add-trials mode loads wizardTrials: [] — the show's OWN trials must
    // still be consulted for the zone new trials should inherit.
    const draft = buildEditModeDraft({
      editMode: { showId: 'show-1', mode: 'add-trials' } as never,
      existingShow: show([]),
      showTrials: [{ id: 'trial-1', timezone: 'America/Denver' } as never],
      existingClasses: [],
      people: [],
    });
    expect(draft.trials).toEqual([]);
    expect(draft.show.timezone).toBe('America/Denver');
  });

  it('falls back to America/New_York when the show has no trials yet', () => {
    const draft = buildEditModeDraft({
      editMode: { showId: 'show-1', mode: 'add-trials' } as never,
      existingShow: show([]),
      showTrials: [],
      existingClasses: [],
      people: [],
    });
    expect(draft.show.timezone).toBe('America/New_York');
  });
});

// MYK9-931: an existing trial's date and start time are carried into the draft as
// SEPARATE fields, so Review shows (and an edit saves) what the trial already has.
describe('buildEditModeDraft trial schedule', () => {
  const build = (plannedStartTime: string | undefined) =>
    buildEditModeDraft({
      editMode: { showId: 'show-1', mode: 'add-classes' } as never,
      existingShow: show([]),
      showTrials: [
        {
          id: 't1',
          name: 'Saturday',
          trialDate: '2026-10-10',
          ...(plannedStartTime !== undefined ? { plannedStartTime } : {}),
        },
      ] as never,
      existingClasses: [],
      people: [],
    }).trials[0];

  it('keeps the existing date and normalises the existing start time', () => {
    const trial = build('9:00 AM');
    expect(trial?.trialDate).toBe('2026-10-10');
    expect(trial?.startTimeDraft).toBe('09:00 AM');
  });

  it('leaves the time unset (not defaulted) when the trial has none', () => {
    const trial = build(undefined);
    expect(trial?.trialDate).toBe('2026-10-10');
    expect(trial?.startTimeDraft).toBeUndefined();
  });
});
