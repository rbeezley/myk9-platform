/**
 * MYK9-1799 (owner decision 2026-11-09): a new show accepts check and cash without being
 * asked. Online entries stay off (they need the club's payout account), and the trial start
 * time and entry window are deliberately NOT defaulted.
 */
import { describe, expect, it } from 'vitest';
import { useWizardStore } from './wizardStore';

describe('wizard store — a new show', () => {
  it('starts accepting check and cash, with online entries off', () => {
    const { show } = useWizardStore.getState();
    expect(show.acceptCheckPayments).toBe(true);
    expect(show.acceptCashPayments).toBe(true);
    expect(show.onlineEntriesEnabled).toBe(false);
  });

  it('goes back to those defaults when she starts a new show', () => {
    useWizardStore.getState().updateShowData({ acceptCheckPayments: false });
    useWizardStore.getState().resetWizard();

    expect(useWizardStore.getState().show.acceptCheckPayments).toBe(true);
    expect(useWizardStore.getState().show.acceptCashPayments).toBe(true);
  });

  it('leaves the entry window blank and adds no trial', () => {
    const { show, trials } = useWizardStore.getState();
    expect(show.entryOpenDate).toBe('');
    expect(show.entryCloseDate).toBe('');
    expect(trials).toEqual([]);
  });
});
