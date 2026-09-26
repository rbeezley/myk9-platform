import { describe, expect, it } from 'vitest';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/store/trialStore';
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

// MYK9-830/831 second review round: the edit draft dropped timezone entirely,
// so loadDraft's wholesale `show` replacement wiped out the wizard store's
// timezone and every downstream save fell back to the SECRETARY'S browser
// zone instead of the show's real one -- most visibly in add-trials mode,
// which starts past the Basics step where the timezone picker lives, so
// nothing in the UI ever gives the secretary a chance to notice or fix it.
describe('buildEditModeDraft timezone', () => {
  const trial = (timezone: string | undefined): Trial =>
    ({
      id: 'trial-1',
      showId: 'show-1',
      timezone,
    }) as unknown as Trial;

  it("edit-show mode initializes the draft from the show's existing trial timezone", () => {
    const draft = buildEditModeDraft({
      editMode: { showId: 'show-1', mode: 'edit-show' } as never,
      existingShow: show([]),
      showTrials: [trial('America/Chicago')],
      existingClasses: [],
      people: [],
    });
    expect(draft.show.timezone).toBe('America/Chicago');
  });

  it("add-trials mode ALSO initializes from the show's existing trial timezone, even though it starts past Basics", () => {
    const draft = buildEditModeDraft({
      editMode: { showId: 'show-1', mode: 'add-trials' } as never,
      existingShow: show([]),
      showTrials: [trial('America/Denver')],
      existingClasses: [],
      people: [],
    });
    expect(draft.show.timezone).toBe('America/Denver');
  });

  it('falls back to America/New_York when the existing trial predates the timezone column', () => {
    const draft = buildEditModeDraft({
      editMode: { showId: 'show-1', mode: 'add-classes' } as never,
      existingShow: show([]),
      showTrials: [trial(undefined)],
      existingClasses: [],
      people: [],
    });
    expect(draft.show.timezone).toBe('America/New_York');
  });
});
