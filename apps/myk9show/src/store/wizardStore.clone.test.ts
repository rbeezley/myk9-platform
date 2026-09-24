import { beforeEach, describe, expect, it } from 'vitest';
import { useWizardStore, type CloneHydrationSnapshot } from './wizardStore';

function snapshot(sourceShowId: string, sourceShowName: string): CloneHydrationSnapshot {
  return {
    sourceShowId,
    sourceShowName,
    show: { name: sourceShowName, organization: 'UKC' },
    judgeDetails: {},
    trials: [
      {
        nameOverride: 'Cloned trial',
        dateTime: '',
        eventNumber: '',
        trialType: 'Nosework',
        classes: [],
      },
    ],
  };
}

describe('wizard store clone hydration', () => {
  beforeEach(() => {
    useWizardStore.getState().resetWizard();
  });

  it('preserves the current draft until the complete snapshot commits atomically', () => {
    const store = useWizardStore.getState();
    store.updateShowData({ name: 'Existing draft' });
    const generation = useWizardStore.getState().beginCloneHydration('source-1', 'Cloned show');

    expect(useWizardStore.getState().show.name).toBe('Existing draft');
    expect(useWizardStore.getState().trials).toEqual([]);

    useWizardStore
      .getState()
      .completeCloneHydration(generation, snapshot('source-1', 'Cloned show'));

    const completed = useWizardStore.getState();
    expect(completed.show.name).toBe('Cloned show');
    expect(completed.show.organization).toBe('UKC');
    expect(completed.trials).toHaveLength(1);
    expect(completed.cloneHydration).toMatchObject({ status: 'ready', sourceShowId: 'source-1' });
  });

  it('leaves the current draft unchanged when source hydration fails', () => {
    const store = useWizardStore.getState();
    store.updateShowData({ name: 'Existing draft' });
    store.addTrial({ nameOverride: 'Existing trial', dateTime: '', eventNumber: '', classes: [] });
    const before = useWizardStore.getState();
    const generation = before.beginCloneHydration('source-1', 'Cloned show');

    useWizardStore.getState().failCloneHydration(generation);

    const after = useWizardStore.getState();
    expect(after.show.name).toBe('Existing draft');
    expect(after.trials).toEqual(before.trials);
    expect(after.cloneHydration).toMatchObject({ status: 'failed', sourceShowId: 'source-1' });
  });

  it('ignores a pending completion after page-level Start Fresh resets the store', () => {
    useWizardStore.getState().updateShowData({ name: 'Existing draft' });
    const generation = useWizardStore.getState().beginCloneHydration('source-1', 'Cloned show');
    useWizardStore.getState().setCurrentStep(2);
    useWizardStore.getState().goToStep(1);

    // Navigation is held while hydration is active; the page-level Start Fresh remains available.
    expect(useWizardStore.getState().currentStep).toBe(0);
    useWizardStore.getState().resetWizard();
    useWizardStore
      .getState()
      .completeCloneHydration(generation, snapshot('source-1', 'Cloned show'));

    const reset = useWizardStore.getState();
    expect(reset.show.name).toBe('');
    expect(reset.trials).toEqual([]);
    expect(reset.cloneHydration.status).toBe('idle');
  });

  it('allows a second source to supersede the first pending clone', () => {
    const firstGeneration = useWizardStore.getState().beginCloneHydration('source-1', 'First show');
    const secondGeneration = useWizardStore
      .getState()
      .beginCloneHydration('source-2', 'Second show');

    useWizardStore
      .getState()
      .completeCloneHydration(firstGeneration, snapshot('source-1', 'First show'));
    expect(useWizardStore.getState().cloneHydration).toMatchObject({
      status: 'hydrating',
      sourceShowId: 'source-2',
    });
    expect(useWizardStore.getState().trials).toEqual([]);

    useWizardStore
      .getState()
      .completeCloneHydration(secondGeneration, snapshot('source-2', 'Second show'));
    expect(useWizardStore.getState().show.name).toBe('Second show');
    expect(useWizardStore.getState().cloneHydration).toMatchObject({
      status: 'ready',
      sourceShowId: 'source-2',
    });
  });

  it('cancels hydration without discarding the existing draft', () => {
    useWizardStore.getState().updateShowData({ name: 'Existing draft' });
    const generation = useWizardStore.getState().beginCloneHydration('source-1', 'Cloned show');
    useWizardStore.getState().cancelCloneHydration(generation);

    expect(useWizardStore.getState().show.name).toBe('Existing draft');
    expect(useWizardStore.getState().cloneHydration.status).toBe('idle');
  });

  it('dismisses a failed clone back to the picker without discarding the draft', () => {
    useWizardStore.getState().updateShowData({ name: 'Existing draft' });
    const generation = useWizardStore.getState().beginCloneHydration('source-1', 'Cloned show');
    useWizardStore.getState().failCloneHydration(generation);
    useWizardStore.getState().cancelCloneHydration(generation);

    expect(useWizardStore.getState().show.name).toBe('Existing draft');
    expect(useWizardStore.getState().cloneHydration).toEqual({
      status: 'idle',
      sourceShowId: null,
      sourceShowName: null,
    });
  });

  it("defaults a cloned trial's missing trial type from the cloned organization, as addTrial does", () => {
    const generation = useWizardStore.getState().beginCloneHydration('source-1', 'Cloned show');
    const legacy = snapshot('source-1', 'Cloned show');
    legacy.trials = [{ ...legacy.trials[0]!, trialType: undefined }];

    useWizardStore.getState().completeCloneHydration(generation, legacy);

    expect(useWizardStore.getState().trials[0]!.trialType).toBe('Nosework');
  });
});
