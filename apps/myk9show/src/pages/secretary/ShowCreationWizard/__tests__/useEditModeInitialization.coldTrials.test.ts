/**
 * MYK9-899: add-classes builds its draft FROM the show's trial list. On a cold device the show
 * can resolve before its trials replicate; a draft built from that empty list was recorded as
 * initialized, and the trials arriving later (with zero classes, so the class count never
 * moved) were never picked up -- the picker sat on "No Trials Configured" with Trials locked.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/store/trialStore';
import { useEditModeInitialization } from '../useEditModeInitialization';

vi.mock('@/hooks/queries/useShowOfficials', () => ({
  getShowOfficials: vi.fn().mockResolvedValue({ secretaries: [], chairmen: [], stewards: [] }),
}));

const show = {
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
  assignedJudges: [],
} as unknown as Show;

const trial = (id: string) =>
  ({ id, showId: 'show-1', name: id, trialDate: '2026-10-10', type: id }) as unknown as Trial;

const editMode = { showId: 'show-1', mode: 'add-classes' } as const;

interface Props {
  trials: Trial[];
  trialsReady: boolean;
  isDirty: boolean;
}

function setup(initial: Props) {
  const loadDraft = vi.fn();
  const hook = renderHook(
    (props: Props) =>
      useEditModeInitialization({
        editMode,
        editModeResolution: { state: 'resolved', show },
        existingTrials: props.trials,
        existingClasses: [],
        people: [],
        isDirty: props.isDirty,
        trialsReady: props.trialsReady,
        loadDraft,
      }),
    { initialProps: initial }
  );
  const trialIdsOfLastDraft = () =>
    (loadDraft.mock.lastCall?.[0].trials as { id: string }[]).map(t => t.id);
  return { loadDraft, rerender: hook.rerender, trialIdsOfLastDraft };
}

describe('add-classes draft initialization on a cold device', () => {
  it("does not build a draft until the show's trials are loaded", () => {
    const { loadDraft } = setup({ trials: [], trialsReady: false, isDirty: false });
    expect(loadDraft).not.toHaveBeenCalled();
  });

  it('builds the draft once the trials arrive (with zero classes)', () => {
    const { loadDraft, rerender, trialIdsOfLastDraft } = setup({
      trials: [],
      trialsReady: false,
      isDirty: false,
    });
    rerender({ trials: [trial('t1')], trialsReady: true, isDirty: false });
    expect(loadDraft).toHaveBeenCalledTimes(1);
    expect(trialIdsOfLastDraft()).toEqual(['t1']);
  });

  it('rebuilds when a trial arrives AFTER an empty ready read (the key carries trial ids)', () => {
    const { loadDraft, rerender, trialIdsOfLastDraft } = setup({
      trials: [],
      trialsReady: true,
      isDirty: false,
    });
    expect(loadDraft).toHaveBeenCalledTimes(1);
    expect(trialIdsOfLastDraft()).toEqual([]);

    rerender({ trials: [trial('t1')], trialsReady: true, isDirty: false });
    expect(loadDraft).toHaveBeenCalledTimes(2);
    expect(trialIdsOfLastDraft()).toEqual(['t1']);
  });

  it('never rebuilds over unsaved selections', () => {
    const { loadDraft, rerender } = setup({
      trials: [trial('t1')],
      trialsReady: true,
      isDirty: false,
    });
    expect(loadDraft).toHaveBeenCalledTimes(1);
    rerender({ trials: [trial('t1'), trial('t2')], trialsReady: true, isDirty: true });
    expect(loadDraft).toHaveBeenCalledTimes(1);
  });

  it('warm path is unchanged: trials already present and ready build exactly one draft', () => {
    const { loadDraft, rerender } = setup({
      trials: [trial('t1')],
      trialsReady: true,
      isDirty: false,
    });
    rerender({ trials: [trial('t1')], trialsReady: true, isDirty: false });
    expect(loadDraft).toHaveBeenCalledTimes(1);
  });
});
