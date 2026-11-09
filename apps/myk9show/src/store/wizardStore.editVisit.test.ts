/**
 * MYK9-1794 — the wizard has one saved draft, and Add trials / Add classes used to write
 * the EXISTING show into it. Two things followed:
 *
 *  1. a half-built new show was replaced, with no warning, by opening Add classes on
 *     another show; and
 *  2. backing out of Add classes left that existing show where Add Show would offer to
 *     "pick up where you left off", one press away from a duplicate show.
 *
 * Each sequence runs on the real store and across a real reload: a fresh module instance
 * reading the same device storage.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DebouncedPersistStorage } from './wizardStorage';

type WizardStore = (typeof import('./wizardStore'))['useWizardStore'];

/**
 * The first import of the store's module graph costs seconds under coverage on a slow
 * runner. It is paid once here, on its own generous clock, so no test's hook pays it.
 */
const COLD_IMPORT_TIMEOUT_MS = 60_000;

/** Every instance a test built, so none leaves a debounced write to land in a later test. */
const openedStores: WizardStore[] = [];

/** A fresh store instance, as a page load would build, once it has read the saved draft. */
async function loadStore(): Promise<WizardStore> {
  vi.resetModules();
  const { useWizardStore } = await import('./wizardStore');
  const { isWizardDraftRead } = await import('./wizardDraftRead');
  await vi.waitFor(() => expect(isWizardDraftRead()).toBe(true));
  openedStores.push(useWizardStore);
  return useWizardStore;
}

function flushWrites(store: WizardStore): Promise<void> {
  return (store.persist.getOptions().storage as DebouncedPersistStorage<unknown>).flush();
}

async function reload(store: WizardStore): Promise<WizardStore> {
  await flushWrites(store);
  return loadStore();
}

function openEditVisit(store: WizardStore, existingShowName: string) {
  store.getState().loadEditDraft({
    show: { ...store.getState().show, name: existingShowName },
    trials: [],
  });
}

describe('wizard store — an edit visit leaves the new-show draft alone', () => {
  let store: WizardStore;

  beforeAll(async () => {
    await import('./wizardStore');
  }, COLD_IMPORT_TIMEOUT_MS);

  // The global setup empties device storage before each test, so a fresh instance starts
  // from nothing saved.
  beforeEach(async () => {
    store = await loadStore();
  });

  afterEach(async () => {
    await Promise.all(openedStores.splice(0).map(flushWrites));
  });

  it('keeps a half-built new show through an Add classes visit and a reload', async () => {
    store.getState().updateShowData({ name: 'Spring Trial (new)' });
    openEditVisit(store, 'Fall Classic (existing)');
    expect(store.getState().show.name).toBe('Fall Classic (existing)');

    const afterReload = await reload(store);

    expect(afterReload.getState().show.name).toBe('Spring Trial (new)');
    expect(afterReload.getState().parkedCreateDraft).toBeNull();
  });

  it('gives Add Show the new-show draft back in the same visit, clean and unparked', () => {
    store.getState().updateShowData({ name: 'Spring Trial (new)' });
    store.getState().addTrial({ trialDate: '2027-04-10', eventNumber: '', classes: [] });
    openEditVisit(store, 'Fall Classic (existing)');

    store.getState().endEditVisit();

    const state = store.getState();
    expect(state.show.name).toBe('Spring Trial (new)');
    expect(state.trials).toHaveLength(1);
    expect(state.parkedCreateDraft).toBeNull();
    expect(state.isDirty).toBe(false);
  });

  it('never leaves the existing show where Add Show would resume it', async () => {
    openEditVisit(store, 'Fall Classic (existing)');

    const afterReload = await reload(store);
    expect(afterReload.getState().show.name).toBe('');

    openEditVisit(afterReload, 'Fall Classic (existing)');
    afterReload.getState().endEditVisit();
    expect(afterReload.getState().show.name).toBe('');
    expect(afterReload.getState().trials).toEqual([]);
  });

  it('keeps the original new-show draft through two edit visits in a row', () => {
    store.getState().updateShowData({ name: 'Spring Trial (new)' });
    openEditVisit(store, 'Fall Classic (existing)');
    openEditVisit(store, 'Winter Cup (existing)');

    store.getState().endEditVisit();

    expect(store.getState().show.name).toBe('Spring Trial (new)');
  });

  it('a discard inside the edit visit clears that visit, not the draft set aside for it', () => {
    store.getState().updateShowData({ name: 'Spring Trial (new)' });
    openEditVisit(store, 'Fall Classic (existing)');

    store.getState().resetWizard();
    expect(store.getState().show.name).toBe('');
    store.getState().endEditVisit();

    expect(store.getState().show.name).toBe('Spring Trial (new)');
  });

  it('a repeated read of the saved draft does not lay it over the edit draft on screen', async () => {
    store.getState().updateShowData({ name: 'Spring Trial (new)' });
    openEditVisit(store, 'Fall Classic (existing)');

    await store.persist.rehydrate();

    expect(store.getState().show.name).toBe('Fall Classic (existing)');
  });

  it('endEditVisit is a no-op outside an edit visit', () => {
    store.getState().updateShowData({ name: 'Spring Trial (new)' });
    store.getState().endEditVisit();

    expect(store.getState().show.name).toBe('Spring Trial (new)');
    expect(store.getState().isDirty).toBe(true);
  });
});
