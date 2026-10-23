/**
 * MYK9-1371: typing in the show name field writes the wizard store on every keystroke, but the
 * persisted draft is written to storage once per debounce window. Also pins that a wizard-store
 * write to a slice the step does not read does not re-render it.
 */
import { Profiler } from 'react';
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistStorage } from 'zustand/middleware';
import { render, screen } from '@/test/utils/testUtils';
import { createDebouncedPersistStorage, WIZARD_PERSIST_DEBOUNCE_MS } from '@/store/wizardStorage';

vi.mock('@/store/clubStore', () => {
  const state = { clubs: [], loadClubs: vi.fn().mockResolvedValue(undefined), syncClubs: vi.fn() };
  const useClubStore = Object.assign(
    (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state }
  );
  return { useClubStore };
});
vi.mock('@/store/userStore', () => {
  const state = {
    people: [],
    isLoading: false,
    loadPeople: vi.fn().mockResolvedValue(undefined),
    loadUsers: vi.fn().mockResolvedValue(undefined),
  };
  return {
    useUserStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
  };
});
vi.mock('@/hooks/useUserClubIds', () => ({ useUserClubIds: () => null }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: null, hasRole: () => false }),
}));
vi.mock('../CloneFromShowCombobox', () => ({ CloneFromShowCombobox: () => null }));
vi.mock('../CloneStatusBanner', () => ({ CloneStatusBanner: () => null }));
vi.mock('@/features/maps/VenueAddressAutocomplete', () => ({
  VenueAddressAutocomplete: () => <div />,
}));
vi.mock('@/components/common/LazyComponents', () => ({ VenuePinMap: () => null }));

import { useWizardStore } from '@/store/wizardStore';
import { ShowDetailsStep } from '../ShowDetailsStep';

type Persisted = ReturnType<
  NonNullable<ReturnType<typeof useWizardStore.persist.getOptions>['partialize']>
>;

const NAME = 'Spring Classic';
const originalStorage = useWizardStore.persist.getOptions().storage;

function spyInner() {
  const inner: PersistStorage<Persisted> = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
  return inner;
}

function useStorage(storage: PersistStorage<Persisted>) {
  useWizardStore.persist.setOptions({ storage });
}

function renderCountedStep() {
  let commits = 0;
  render(
    <Profiler
      id="show-details"
      onRender={(_id, phase) => {
        // 'update' commits are the step re-rendering for a store change; a descendant's own
        // setState-in-effect follows as 'nested-update' and is not what this pins.
        if (phase === 'update') commits += 1;
      }}
    >
      <ShowDetailsStep />
    </Profiler>
  );
  return { commits: () => commits };
}

function typeShowName(text: string) {
  const input = screen.getByPlaceholderText('Enter show name');
  for (let i = 1; i <= text.length; i += 1) {
    fireEvent.change(input, { target: { value: text.slice(0, i) } });
  }
}

describe('ShowDetailsStep typing vs draft persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    useWizardStore.getState().resetWizard();
  });

  afterEach(() => {
    vi.useRealTimers();
    useWizardStore.persist.setOptions({ storage: originalStorage });
  });

  it('control: without the debounce every keystroke is a storage write', () => {
    const inner = spyInner();
    useStorage(inner);
    renderCountedStep();
    const before = vi.mocked(inner.setItem).mock.calls.length;

    typeShowName(NAME);

    expect(useWizardStore.getState().show.name).toBe(NAME);
    expect(vi.mocked(inner.setItem).mock.calls.length - before).toBe(NAME.length);
  });

  it('one wizard-store write per keystroke, one storage write per debounce window', () => {
    const inner = spyInner();
    useStorage(createDebouncedPersistStorage(inner));
    renderCountedStep();
    const before = vi.mocked(inner.setItem).mock.calls.length;
    let storeWrites = 0;
    const unsubscribe = useWizardStore.subscribe((state, prev) => {
      if (state.show.name !== prev.show.name) storeWrites += 1;
    });

    typeShowName(NAME);
    unsubscribe();
    expect(storeWrites).toBe(NAME.length);
    expect(vi.mocked(inner.setItem).mock.calls.length - before).toBe(0);

    act(() => {
      vi.advanceTimersByTime(WIZARD_PERSIST_DEBOUNCE_MS);
    });
    const writes = vi.mocked(inner.setItem).mock.calls.slice(before);
    expect(writes).toHaveLength(1);
    expect(writes[0][1].state).toMatchObject({ show: { name: NAME } });
  });

  it('renders once per keystroke and not for a wizard-store write to an unread slice', () => {
    useStorage(createDebouncedPersistStorage(spyInner()));
    const step = renderCountedStep();
    const mounted = step.commits();

    act(() => {
      useWizardStore.setState({ lastSaved: new Date(), isDirty: true, currentStep: 0 });
    });
    expect(step.commits()).toBe(mounted);

    typeShowName(NAME);
    expect(step.commits() - mounted).toBe(NAME.length);
  });
});
