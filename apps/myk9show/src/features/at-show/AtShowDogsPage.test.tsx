import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/test/utils/testUtils';
import type { StaffDog } from './staffDogIndex';

const mocks = vi.hoisted(() => ({
  role: 'admin' as string | null,
  dogs: [] as StaffDog[],
  toggle: vi.fn(),
  favorites: new Set<number>(),
  checkIn: vi.fn(),
  loadFailed: false,
  isComplete: true,
  retry: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('./useRingsideEffectiveRole', () => ({
  useRingsideEffectiveRole: () => ({ ringsideRole: mocks.role }),
}));
vi.mock('./useAtShowStaffDogs', () => ({
  useAtShowStaffDogs: () => ({
    dogs: mocks.dogs,
    showName: 'Spring Show',
    isLoading: false,
    isComplete: mocks.isComplete,
    loadFailed: mocks.loadFailed,
    onRetry: mocks.retry,
  }),
}));
vi.mock('./dogFavoritesSync', () => ({
  useAtShowDogFavoritesSynced: () => ({
    favoriteArmbands: mocks.favorites,
    toggleFavoriteArmband: mocks.toggle,
  }),
}));
vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: (...args: unknown[]) => mocks.success(...args),
    error: (...args: unknown[]) => mocks.error(...args),
  },
}));
vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: (...args: unknown[]) => mocks.checkIn(...args),
}));

import AtShowDogsPage from './AtShowDogsPage';
import AtShowDogPage from './AtShowDogPage';

function dog(over: Partial<StaffDog> & { key: string; dogName: string }): StaffDog {
  return {
    breed: 'Beagle',
    handler: 'Amy',
    armband: 1,
    entries: [],
    uncheckedEntryIds: [],
    ...over,
  };
}

function dogRoute() {
  return (
    <Routes>
      <Route path="/at-show/:showId/dogs/:dogKey" element={<AtShowDogPage />} />
    </Routes>
  );
}

function renderRoutes(path: string) {
  return render(
    <Routes>
      <Route path="/at-show/:showId" element={<div>class picker</div>} />
      <Route path="/at-show/:showId/dogs" element={<AtShowDogsPage />} />
      <Route path="/at-show/:showId/dogs/:dogKey" element={<AtShowDogPage />} />
    </Routes>,
    { initialRoute: path }
  );
}

beforeEach(() => {
  mocks.role = 'admin';
  mocks.favorites = new Set();
  mocks.toggle.mockReset();
  mocks.checkIn.mockReset();
  mocks.loadFailed = false;
  mocks.isComplete = true;
  mocks.retry.mockReset();
  mocks.success.mockReset();
  mocks.error.mockReset();
  sessionStorage.clear();
  mocks.dogs = [
    dog({ key: 'd1', dogName: 'Zip', armband: 12, handler: 'Amy' }),
    dog({ key: 'd2', dogName: 'Bo', armband: 3, handler: 'Zed' }),
  ];
});

describe('AtShowDogsPage', () => {
  it('lists dogs, searches and reports the count', () => {
    renderRoutes('/at-show/s1/dogs');
    expect(screen.getByText('2 of 2 dogs')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search dogs'), { target: { value: 'zed' } });
    expect(screen.getByText('1 of 2 dogs')).toBeInTheDocument();
    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(screen.queryByText('Zip')).not.toBeInTheDocument();
  });

  it('sorts by dog name', () => {
    renderRoutes('/at-show/s1/dogs');
    fireEvent.change(screen.getByLabelText('Sort dogs'), { target: { value: 'dog' } });
    const names = screen.getAllByTestId(/^at-show-dog-d/).map(li => li.textContent);
    expect(names[0]).toContain('Bo');
  });

  it('shows the empty Favorites copy and keeps the tab for the session', () => {
    const { unmount } = renderRoutes('/at-show/s1/dogs');
    fireEvent.click(screen.getByRole('tab', { name: /Favorites/ }));
    expect(screen.getByText('No Favorites Yet')).toBeInTheDocument();
    unmount();
    renderRoutes('/at-show/s1/dogs');
    expect(screen.getByRole('tab', { name: /Favorites/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('lists favorited dogs and toggles through the synced favorites', () => {
    mocks.favorites = new Set([3]);
    renderRoutes('/at-show/s1/dogs');
    fireEvent.click(screen.getByRole('tab', { name: /Favorites/ }));
    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(screen.queryByText('Zip')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Remove Bo from favorites/ }));
    expect(mocks.toggle).toHaveBeenCalledWith(3);
  });

  it.each(['exhibitor', null])('sends a %s role back to the class picker', role => {
    mocks.role = role;
    renderRoutes('/at-show/s1/dogs');
    expect(screen.getByText('class picker')).toBeInTheDocument();
    expect(screen.queryByTestId('at-show-dogs')).not.toBeInTheDocument();
  });
});

describe('AtShowDogPage', () => {
  const classEntry = (id: string, status: string) => ({
    entryId: id,
    classId: `c-${id}`,
    routeClassIds: [`c-${id}`],
    className: `Class ${id}`,
    trialLabel: null,
    checkInStatus: status,
    isPulled: false,
    isMoved: false,
    isScored: false,
    resultText: null,
    searchTime: null,
    faultCount: null,
    placement: null,
    resultsReleased: false,
  });

  it('checks the dog in to every unchecked class and reports it in a toast', async () => {
    mocks.checkIn.mockResolvedValue(null);
    mocks.dogs = [
      dog({
        key: 'd1',
        dogName: 'Zip',
        entries: [classEntry('e1', 'no-status'), classEntry('e2', 'no-status')],
        uncheckedEntryIds: ['e1', 'e2'],
      }),
    ];
    renderRoutes('/at-show/s1/dogs/d1');
    fireEvent.click(screen.getByRole('button', { name: 'Check In All (2)' }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('✓ Checked in to 2 classes'));
    expect(mocks.checkIn).toHaveBeenCalledWith('e1', 'checked-in');
    expect(mocks.checkIn).toHaveBeenCalledWith('e2', 'checked-in');
  });

  it('toasts the failure and keeps offering the entry that did not take', async () => {
    mocks.checkIn.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('queue'));
    mocks.dogs = [
      dog({
        key: 'd1',
        dogName: 'Zip',
        entries: [classEntry('e1', 'no-status'), classEntry('e2', 'no-status')],
        uncheckedEntryIds: ['e1', 'e2'],
      }),
    ];
    renderRoutes('/at-show/s1/dogs/d1');
    fireEvent.click(screen.getByRole('button', { name: 'Check In All (2)' }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith('1 class could not be checked in', expect.anything())
    );
    expect(screen.getByRole('button', { name: 'Check In All (2)' })).toBeEnabled();
  });

  it('re-offers check-in for an entry another device reset, without a remount', async () => {
    mocks.checkIn.mockResolvedValue(null);
    mocks.dogs = [
      dog({
        key: 'd1',
        dogName: 'Zip',
        entries: [classEntry('e1', 'no-status')],
        uncheckedEntryIds: ['e1'],
      }),
    ];
    const view = renderRoutes('/at-show/s1/dogs/d1');
    fireEvent.click(screen.getByRole('button', { name: 'Check In All (1)' }));
    await waitFor(() => expect(mocks.checkIn).toHaveBeenCalledTimes(1));
    mocks.dogs = [dog({ key: 'd1', dogName: 'Zip', entries: [classEntry('e1', 'checked-in')] })];
    view.rerender(dogRoute());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Check In All/ })).not.toBeInTheDocument()
    );
    mocks.dogs = [
      dog({
        key: 'd1',
        dogName: 'Zip',
        entries: [classEntry('e1', 'no-status'), classEntry('e9', 'no-status')],
        uncheckedEntryIds: ['e1', 'e9'],
      }),
    ];
    view.rerender(dogRoute());
    expect(await screen.findByRole('button', { name: 'Check In All (2)' })).toBeInTheDocument();
  });

  it('links each class to its entry list', () => {
    mocks.dogs = [dog({ key: 'd1', dogName: 'Zip', entries: [classEntry('e1', 'checked-in')] })];
    renderRoutes('/at-show/s1/dogs/d1');
    expect(screen.getByRole('link', { name: /Open Class e1 entry list/ })).toHaveAttribute(
      'href',
      '/at-show/s1/class/c-e1'
    );
  });

  it('offers a retry when the read failed instead of claiming the dog is missing', () => {
    mocks.dogs = [];
    mocks.loadFailed = true;
    renderRoutes('/at-show/s1/dogs/d1');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.retry).toHaveBeenCalled();
    expect(screen.queryByText(/isn't on this device/)).not.toBeInTheDocument();
  });

  it('links a paired class to the combined entry list', () => {
    mocks.dogs = [
      dog({
        key: 'd1',
        dogName: 'Zip',
        entries: [{ ...classEntry('e1', 'checked-in'), routeClassIds: ['c-a', 'c-b'] }],
      }),
    ];
    renderRoutes('/at-show/s1/dogs/d1');
    expect(screen.getByRole('link', { name: /entry list/ })).toHaveAttribute(
      'href',
      '/at-show/s1/class/c-a/c-b'
    );
  });

  it('warns that cached data may be stale when a refresh failed, on the list and the dog page', () => {
    mocks.loadFailed = true;
    mocks.dogs = [dog({ key: 'd1', dogName: 'Zip', entries: [classEntry('e1', 'checked-in')] })];
    const { unmount } = renderRoutes('/at-show/s1/dogs');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.retry).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Zip')).toBeInTheDocument();
    unmount();
    renderRoutes('/at-show/s1/dogs/d1');
    expect(screen.getByText(/may be out of date/)).toBeInTheDocument();
  });

  it('blocks Check In All and says so while the show-wide replica is incomplete', () => {
    mocks.isComplete = false;
    mocks.dogs = [
      dog({
        key: 'd1',
        dogName: 'Zip',
        entries: [classEntry('e1', 'no-status')],
        uncheckedEntryIds: ['e1'],
      }),
    ];
    renderRoutes('/at-show/s1/dogs/d1');
    expect(screen.queryByRole('button', { name: /Check In All/ })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Connect to sync this show before checking in to every class/)
    ).toBeInTheDocument();
  });

  it('warns on the dog list that a partial replica may be missing dogs', () => {
    mocks.isComplete = false;
    renderRoutes('/at-show/s1/dogs');
    expect(screen.getByText(/some dogs or classes may be missing/)).toBeInTheDocument();
  });

  it('shows a moved entry as Moved with no status badge', () => {
    mocks.dogs = [
      dog({
        key: 'd1',
        dogName: 'Zip',
        entries: [{ ...classEntry('e1', 'checked-in'), isMoved: true }],
      }),
    ];
    renderRoutes('/at-show/s1/dogs/d1');
    expect(screen.getByText('Moved')).toBeInTheDocument();
  });
});
