/**
 * The wizard store persists `show` and `trials`, and the mount-time
 * `resetWizard()` that used to clear them was removed so a secretary stops
 * losing 40 minutes of show setup when she navigates away. That makes the
 * resume state real — and it has to be OFFERED, or the next show she starts
 * silently inherits the last one's fields.
 *
 * The first version of this check was a `useState` initializer, which could
 * never fire: persist hydration is asynchronous in every environment, so it
 * always read the pristine store. These pin the derived behaviour instead.
 */
import { describe, it, expect } from 'vitest';
import { shouldOfferDraftResume } from '../WizardDraftResumeBanner';

const base = {
  isEditMode: false,
  dismissed: false,
  isDirty: false,
  showName: undefined as string | undefined,
  trialCount: 0,
};

describe('shouldOfferDraftResume', () => {
  it('offers a resume for a rehydrated draft carrying a name', () => {
    // The case the useState version could never see: hydration lands AFTER the
    // first render, and a rehydrated draft is always clean (isDirty is not
    // persisted).
    expect(shouldOfferDraftResume({ ...base, showName: 'Spring Classic' })).toBe(true);
  });

  it('offers a resume for a draft carrying only trials', () => {
    expect(shouldOfferDraftResume({ ...base, trialCount: 2 })).toBe(true);
  });

  it('stays silent on a genuinely empty wizard', () => {
    expect(shouldOfferDraftResume(base)).toBe(false);
    expect(shouldOfferDraftResume({ ...base, showName: '   ' })).toBe(false);
  });

  it('stays silent while the secretary is actively typing a new show', () => {
    // Without this, the banner would appear on the first keystroke and offer to
    // "resume" the show being created right now.
    expect(shouldOfferDraftResume({ ...base, showName: 'Spring Classic', isDirty: true })).toBe(false);
  });

  it('stays silent once she has chosen to start fresh', () => {
    expect(shouldOfferDraftResume({ ...base, showName: 'Spring Classic', dismissed: true })).toBe(
      false
    );
  });

  it('never appears in edit mode, where the draft comes from the show itself', () => {
    expect(shouldOfferDraftResume({ ...base, showName: 'Spring Classic', isEditMode: true })).toBe(
      false
    );
  });
});
