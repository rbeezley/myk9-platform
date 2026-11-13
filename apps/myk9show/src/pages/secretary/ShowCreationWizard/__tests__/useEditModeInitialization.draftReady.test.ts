/**
 * MYK9-1794: the edit draft sets the new-show draft aside as it loads, so it must not load
 * before the store has read the saved draft, and the officials answer for the existing show
 * must not land on a new-show draft the secretary has already gone back to.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Show } from '@/types/show-types';
import { getShowOfficials } from '@/hooks/queries/useShowOfficials';
import { useWizardStore } from '@/store/wizardStore';
import { useEditModeInitialization } from '../useEditModeInitialization';

vi.mock('@/hooks/queries/useShowOfficials', () => ({ getShowOfficials: vi.fn() }));

const show = {
  id: 'show-1',
  name: 'Fall Classic (existing)',
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

const officials = {
  secretaries: [{ personId: 'person-existing-secretary' }],
  chairmen: [],
  stewards: [],
} as unknown as Awaited<ReturnType<typeof getShowOfficials>>;

function setup(draftReady: boolean) {
  const loadDraft = vi.fn(useWizardStore.getState().loadEditDraft);
  const hook = renderHook(
    (props: { draftReady: boolean }) =>
      useEditModeInitialization({
        editMode: { showId: 'show-1', mode: 'add-trials' },
        editModeResolution: { state: 'resolved', show },
        existingTrials: [],
        existingClasses: [],
        people: [],
        isDirty: false,
        draftReady: props.draftReady,
        loadDraft,
      }),
    { initialProps: { draftReady } }
  );
  return { loadDraft, rerender: hook.rerender };
}

describe('edit draft initialization and the saved new-show draft', () => {
  beforeEach(() => {
    vi.mocked(getShowOfficials).mockReset().mockResolvedValue(officials);
    useWizardStore.getState().endEditVisit();
    useWizardStore.getState().resetWizard();
  });

  it('waits for the saved draft to be read, then builds the edit draft once', () => {
    const { loadDraft, rerender } = setup(false);
    expect(loadDraft).not.toHaveBeenCalled();

    rerender({ draftReady: true });

    expect(loadDraft).toHaveBeenCalledTimes(1);
    expect(useWizardStore.getState().show.name).toBe('Fall Classic (existing)');
  });

  it("backfills the existing show's officials while the edit visit is open", async () => {
    setup(true);

    await waitFor(() =>
      expect(useWizardStore.getState().show.officials.secretary).toEqual([
        'person-existing-secretary',
      ])
    );
  });

  it('does not write those officials onto the new-show draft she has gone back to', async () => {
    let answer: (value: typeof officials) => void = () => {};
    vi.mocked(getShowOfficials).mockReturnValue(
      new Promise(resolve => {
        answer = resolve;
      })
    );
    useWizardStore.getState().updateShowData({ name: 'Spring Trial (new)' });
    setup(true);
    expect(useWizardStore.getState().show.name).toBe('Fall Classic (existing)');

    // She returns to Add Show before the officials read answers.
    useWizardStore.getState().endEditVisit();
    answer(officials);
    await vi.waitFor(() => expect(getShowOfficials).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    expect(useWizardStore.getState().show.name).toBe('Spring Trial (new)');
    expect(useWizardStore.getState().show.officials.secretary).toEqual([]);
  });
});
