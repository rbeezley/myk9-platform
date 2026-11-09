/**
 * MYK9-1794 — the wizard has one saved draft, and Add trials / Add classes used to write
 * the EXISTING show into it. Two things followed:
 *
 *  1. a half-built new show was replaced, with no warning, by opening Add classes on
 *     another show; and
 *  2. backing out of Add classes left that existing show where Add Show would offer to
 *     "pick up where you left off", one press away from a duplicate show.
 *
 * "What a reload would find" is asserted as what is saved on the device: the store's own
 * storage is flushed and read back. An earlier version rebuilt the store with
 * `vi.resetModules()` instead; every rebuilt instance stayed registered with the global
 * store reset, which re-armed its debounced write before each test, so the outcome depended
 * on how fast the runner was.
 */
import { describe, expect, it } from 'vitest';
import type { StorageValue } from 'zustand/middleware';
import { useWizardStore, type WizardState } from './wizardStore';
import type { DebouncedPersistStorage } from './wizardStorage';

/** The draft a page load would read: everything pending written, then read back. */
async function savedDraftOnDevice(): Promise<Partial<WizardState>> {
  const { name, storage } = useWizardStore.persist.getOptions();
  const deviceStorage = storage as DebouncedPersistStorage<Partial<WizardState>>;
  await deviceStorage.flush();
  const saved = (await deviceStorage.getItem(name ?? '')) as StorageValue<
    Partial<WizardState>
  > | null;
  if (!saved) throw new Error('no wizard draft saved on this device');
  return saved.state;
}

function openEditVisit(existingShowName: string) {
  useWizardStore.getState().loadEditDraft({
    show: { ...useWizardStore.getState().show, name: existingShowName },
    trials: [],
  });
}

describe('wizard store — an edit visit leaves the new-show draft alone', () => {
  it('keeps a half-built new show saved on the device through an Add classes visit', async () => {
    useWizardStore.getState().updateShowData({ name: 'Spring Trial (new)' });
    openEditVisit('Fall Classic (existing)');
    expect(useWizardStore.getState().show.name).toBe('Fall Classic (existing)');

    // Typing in the edit visit keeps writing; none of it may reach the saved draft.
    useWizardStore.getState().updateShowData({ location: 'Edited in the edit visit' });

    const saved = await savedDraftOnDevice();
    expect(saved.show?.name).toBe('Spring Trial (new)');
    expect(saved.show?.location).toBe('');
  });

  it('gives Add Show the new-show draft back in the same visit, clean and unparked', async () => {
    useWizardStore.getState().updateShowData({ name: 'Spring Trial (new)' });
    useWizardStore.getState().addTrial({ trialDate: '2027-04-10', eventNumber: '', classes: [] });
    openEditVisit('Fall Classic (existing)');

    useWizardStore.getState().endEditVisit();

    const state = useWizardStore.getState();
    expect(state.show.name).toBe('Spring Trial (new)');
    expect(state.trials).toHaveLength(1);
    expect(state.parkedCreateDraft).toBeNull();
    expect(state.isDirty).toBe(false);
    expect((await savedDraftOnDevice()).show?.name).toBe('Spring Trial (new)');
  });

  it('never saves the existing show where Add Show would resume it', async () => {
    openEditVisit('Fall Classic (existing)');
    expect((await savedDraftOnDevice()).show?.name).toBe('');

    useWizardStore.getState().endEditVisit();

    expect(useWizardStore.getState().show.name).toBe('');
    expect(useWizardStore.getState().trials).toEqual([]);
    expect((await savedDraftOnDevice()).show?.name).toBe('');
  });

  it('keeps the original new-show draft through two edit visits in a row', async () => {
    useWizardStore.getState().updateShowData({ name: 'Spring Trial (new)' });
    openEditVisit('Fall Classic (existing)');
    openEditVisit('Winter Cup (existing)');
    expect((await savedDraftOnDevice()).show?.name).toBe('Spring Trial (new)');

    useWizardStore.getState().endEditVisit();

    expect(useWizardStore.getState().show.name).toBe('Spring Trial (new)');
  });

  it('a discard inside the edit visit clears that visit, not the draft set aside for it', async () => {
    useWizardStore.getState().updateShowData({ name: 'Spring Trial (new)' });
    openEditVisit('Fall Classic (existing)');

    useWizardStore.getState().resetWizard();
    expect(useWizardStore.getState().show.name).toBe('');
    expect((await savedDraftOnDevice()).show?.name).toBe('Spring Trial (new)');
    useWizardStore.getState().endEditVisit();

    expect(useWizardStore.getState().show.name).toBe('Spring Trial (new)');
  });

  it('a repeated read of the saved draft does not lay it over the edit draft on screen', async () => {
    useWizardStore.getState().updateShowData({ name: 'Spring Trial (new)' });
    openEditVisit('Fall Classic (existing)');

    await useWizardStore.persist.rehydrate();

    expect(useWizardStore.getState().show.name).toBe('Fall Classic (existing)');
  });

  it('endEditVisit is a no-op outside an edit visit', () => {
    useWizardStore.getState().updateShowData({ name: 'Spring Trial (new)' });
    useWizardStore.getState().endEditVisit();

    expect(useWizardStore.getState().show.name).toBe('Spring Trial (new)');
    expect(useWizardStore.getState().isDirty).toBe(true);
  });
});
