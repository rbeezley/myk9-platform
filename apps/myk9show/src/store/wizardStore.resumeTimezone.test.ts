import { beforeEach, describe, expect, it } from 'vitest';
import { useWizardStore } from './wizardStore';

// MYK9-830/831 second review round, "resume/rehydrate from persisted store"
// row: zustand's `persist` merge option and the store's own `loadDraft` share
// the same wholesale-replace-of-`show` shape (`{...state, ...draft}`), so
// this pins that shape's timezone behavior directly. The zustand `persist`
// `merge` callback itself is not exported, but it is exactly this shape
// (see wizardStore.ts) -- a persisted draft's `show` object replaces
// `state.show` wholesale, the same as `loadDraft` does here.
describe('wizard store draft-restore timezone (loadDraft)', () => {
  beforeEach(() => {
    useWizardStore.getState().resetWizard();
  });

  it('preserves an explicit timezone carried on the restored draft', () => {
    useWizardStore.getState().loadDraft({
      show: { ...useWizardStore.getState().show, timezone: 'America/Denver' },
    });

    expect(useWizardStore.getState().show.timezone).toBe('America/Denver');
  });

  it('does not backfill a missing timezone on restore -- callers resolve it explicitly', () => {
    const { timezone: _dropped, ...showWithoutTimezone } = useWizardStore.getState().show;
    useWizardStore.getState().loadDraft({ show: showWithoutTimezone });

    expect(useWizardStore.getState().show.timezone).toBeUndefined();
  });
});
