import { describe, expect, it } from 'vitest';
import { buildTrialInputFromWizard } from '../buildTrialInputFromWizard';
import type { WizardTrialView } from '@/utils/wizardTrialNames';

/**
 * MYK9-831: the offline and add-trials (edit mode) wizard paths both build a
 * trial's TrialInput here before handing it to trialStore.addTrial. Both
 * previously lost the secretary's chosen timezone because this construction
 * never included it — the trial synced with the DB's 'America/New_York'
 * default no matter what the wizard's Basics step showed.
 */
const TRIAL_VIEW: WizardTrialView = {
  effectiveNamesByTrialId: new Map([['trial-1', 'Saturday Trial']]),
  persistedTrialCount: 0,
  hasAnyTrials: true,
};

describe('buildTrialInputFromWizard — timezone threading (MYK9-831)', () => {
  it('carries the show timezone onto a trial created offline (new show)', () => {
    const input = buildTrialInputFromWizard({
      wizardTrial: { id: 'trial-1', dateTime: '2026-06-12T09:00:00', eventNumber: '1' },
      index: 0,
      showId: 'show-1',
      showName: 'Tulsa Fairgrounds Show',
      showOrganization: 'AKC',
      timezone: 'America/Chicago',
      registryId: 'AKC',
      trialView: TRIAL_VIEW,
    });

    expect(input.timezone).toBe('America/Chicago');
  });

  it('carries the show timezone onto a trial added to an existing show (add-trials / edit mode)', () => {
    const input = buildTrialInputFromWizard({
      wizardTrial: { id: 'trial-1', dateTime: '2026-06-12T09:00:00', eventNumber: '1' },
      index: 0,
      showId: 'existing-show-1',
      showName: 'Existing Show',
      showOrganization: 'AKC',
      timezone: 'America/Los_Angeles',
      registryId: 'AKC',
      trialView: TRIAL_VIEW,
    });

    expect(input.timezone).toBe('America/Los_Angeles');
  });
});
