/**
 * MYK9-1795 — the passive visit on the REAL wizard hooks.
 *
 * Mounts `useRegistrationWizard` + `useOnlyDogPreselect` exactly as the page
 * does, with the real registration store, the real draft persistence and the
 * localStorage mock. Only data sources (roster, show, auth, availability) are
 * stubbed. The marker holds only while `registrationData` is the identical
 * object the tick produced, so anything in the real wizard that replaced it
 * would bring back a saved draft and a local registration on a passive view.
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Dog } from '@/types/dog-types';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
import { useDraftPersistence } from '@/hooks/useDraftPersistence';
import { useRegistrationWizard } from '../useRegistrationWizard';
import { useOnlyDogPreselect } from '../useOnlyDogPreselect';

const SHOW = 'show-1';
const USER = 'user-1';

const roles = vi.hoisted(() => ({ isSecretary: false }));
const roster = vi.hoisted(() => ({ dogs: [] as unknown[] }));

vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' }, userWithRoles: null }),
}));
vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => ({
    isSecretary: roles.isSecretary,
    isClubAdmin: false,
    isSiteAdmin: false,
    canAssignArmbands: false,
  }),
}));
vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({
    profile: { id: 'profile-1', person_id: USER },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/useReplicationSyncActions', () => ({
  useReplicationSyncActions: () => ({ triggerSync: vi.fn() }),
}));
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    dogs: roster.dogs,
    isLoading: false,
    isReady: true,
    rosterError: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({ useClassStoreCompat: () => ({ classes: [] }) }));
vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    shows: [{ id: SHOW, name: 'Test Show', organization: null, startDate: '2026-12-01' }],
  }),
}));
vi.mock('@/store/cartStore', () => ({
  useCartItems: () => [],
  useCartStore: (selector: (s: unknown) => unknown) =>
    selector({
      cart: null,
      isLoading: false,
      clearCart: vi.fn(),
      ensureCart: vi.fn(),
      addItem: vi.fn(),
      abandonCart: vi.fn(),
    }),
}));
vi.mock('@/hooks/useEntryWindowTimezone', () => ({
  useEntryWindowTimezone: () => ({
    timeZone: 'America/New_York',
    isReady: true,
    isUnavailable: false,
  }),
}));
vi.mock('@/hooks/useClassAvailability', () => ({
  useClassAvailability: () => ({
    classes: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/queries/useOrganizationAgreement', () => ({
  useOrganizationAgreement: () => ({
    data: null,
    isLoading: false,
    isFetching: false,
    isSuccess: true,
    isPlaceholderData: false,
  }),
}));
vi.mock('../useEntryCloseAvailability', () => ({
  useEntryCloseAvailability: () => ({ canEnter: true }),
}));

const makeDog = (id: string): Dog =>
  ({
    id,
    name: id,
    callName: id,
    breed: 'Border Collie',
    sex: 'female',
    ownerId: 'owner-1',
    status: 'active',
  }) as Dog;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/shows/${SHOW}/register`]}>
        <Routes>
          <Route path="/shows/:showId/register" element={<>{children}</>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Same two calls, same order, as `RegistrationWizardPage`.
function usePage() {
  const wiz = useRegistrationWizard();
  useOnlyDogPreselect(wiz);
  return wiz;
}

const mountPage = () => renderHook(usePage, { wrapper });
// Read through a fresh hook: `localStorage` is a mock whose keys cannot be
// enumerated. `suppressSave` and the unmount keep the probe itself from drafting
// the store's current selection.
const storedDrafts = () => {
  const probe = renderHook(() =>
    useDraftPersistence(SHOW, USER, 'dog-selection', { suppressSave: true })
  );
  const drafts = probe.result.current.availableDrafts;
  probe.unmount();
  return drafts;
};
const resumable = () => storedDrafts().filter(d => (d.selectedDogsCount ?? 0) > 0 && !d.completed);
const registrations = () => Object.keys(useShowRegistrationStore.getState().registrations ?? {});
const flush = () => act(() => vi.advanceTimersByTimeAsync(31_000));

describe('the passive visit on the real wizard', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useShowRegistrationStore.setState(useShowRegistrationStore.getInitialState());
    roles.isSecretary = false;
    roster.dogs = [makeDog('dog-1')];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('ticks the only dog, writes nothing, and ticks again on the next visit', async () => {
    const { result, unmount } = mountPage();
    await flush();

    expect(result.current.registrationData.selectedDogs).toEqual(['dog-1']);
    expect(result.current.isPassiveAutoTick).toBe(true);
    expect(result.current.hasUnsavedChanges).toBe(false);
    await flush();
    expect(result.current.isPassiveAutoTick).toBe(true);

    act(() => window.dispatchEvent(new Event('pagehide')));
    unmount();
    expect(storedDrafts()).toEqual([]);
    expect(registrations()).toEqual([]);

    const next = mountPage();
    await flush();
    expect(next.result.current.registrationData.selectedDogs).toEqual(['dog-1']);
    expect(next.result.current.isPassiveAutoTick).toBe(true);
    expect(resumable()).toEqual([]);
    next.unmount();
    expect(resumable()).toEqual([]);
  });

  it('respects an untick for the rest of the visit', async () => {
    const { result } = mountPage();
    await flush();
    expect(result.current.isPassiveAutoTick).toBe(true);

    await act(async () => {
      await result.current.handleDogSelectionChange([]);
    });
    await flush();
    await flush();

    expect(result.current.registrationData.selectedDogs).toEqual([]);
    expect(result.current.isPassiveAutoTick).toBe(false);
  });

  it('saves a draft and creates the registration once she leaves the dog step', async () => {
    const { result, unmount } = mountPage();
    await flush();
    expect(registrations()).toEqual([]);

    act(() => result.current.setCurrentStep(1));
    await flush();

    expect(result.current.isPassiveAutoTick).toBe(false);
    expect(registrations()).toHaveLength(1);
    expect(resumable()).toHaveLength(1);
    unmount();
  });

  it('leaves the step alone when a resumable draft is already saved for this show', async () => {
    const saver = renderHook(() => ({
      persistence: useDraftPersistence(SHOW, USER, 'class-selection'),
      setDraftData: useShowRegistrationStore(s => s.setDraftData),
    }));
    act(() => saver.result.current.setDraftData({ selectedDogs: ['dog-1'] }));
    act(() => {
      saver.result.current.persistence.saveDraft();
    });
    saver.unmount();
    expect(resumable()).toHaveLength(1);

    const { result } = mountPage();
    await flush();

    expect(result.current.isPassiveAutoTick).toBe(false);
    expect(result.current.availableDrafts).toHaveLength(1);
  });
});
