/**
 * MYK9-2164 (owner decision 2026-11-13 on MYK9-1965, reversing MYK9-1799's defaults): a new show
 * takes online entries, and check and cash only if she adds them. The trial start time and entry
 * window are still deliberately NOT defaulted.
 */
import { describe, expect, it } from 'vitest';
import { useWizardStore } from './wizardStore';

describe('wizard store — a new show', () => {
  it('starts with online entries on, and check and cash off', () => {
    const { show } = useWizardStore.getState();
    expect(show.onlineEntriesEnabled).toBe(true);
    expect(show.acceptCheckPayments).toBe(false);
    expect(show.acceptCashPayments).toBe(false);
  });

  it('goes back to those defaults when she starts a new show', () => {
    useWizardStore.getState().updateShowData({ acceptCheckPayments: true });
    useWizardStore.getState().resetWizard();

    expect(useWizardStore.getState().show.onlineEntriesEnabled).toBe(true);
    expect(useWizardStore.getState().show.acceptCheckPayments).toBe(false);
    expect(useWizardStore.getState().show.acceptCashPayments).toBe(false);
  });

  it('leaves the entry window blank and adds no trial', () => {
    const { show, trials } = useWizardStore.getState();
    expect(show.entryOpenDate).toBe('');
    expect(show.entryCloseDate).toBe('');
    expect(trials).toEqual([]);
  });
});
