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
