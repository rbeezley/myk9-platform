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
}));

vi.mock('./useRingsideEffectiveRole', () => ({
  useRingsideEffectiveRole: () => ({ ringsideRole: mocks.role }),
}));
vi.mock('./useAtShowStaffDogs', () => ({
  useAtShowStaffDogs: () => ({
    dogs: mocks.dogs,
    showName: 'Spring Show',
    isLoading: false,
    loadFailed: false,
    onRetry: vi.fn(),
  }),
}));
vi.mock('./dogFavoritesSync', () => ({
  useAtShowDogFavoritesSynced: () => ({
    favoriteArmbands: mocks.favorites,
    toggleFavoriteArmband: mocks.toggle,
  }),
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
    className: `Class ${id}`,
    trialLabel: null,
    checkInStatus: status,
    isPulled: false,
    isScored: false,
    resultText: null,
    searchTime: null,
    faultCount: null,
    placement: null,
    resultsReleased: false,
  });

  it('checks the dog in to every unchecked class and reports the count', async () => {
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
    await waitFor(() => expect(screen.getByText('✓ Checked in to 2 classes')).toBeInTheDocument());
    expect(mocks.checkIn).toHaveBeenCalledWith('e1', 'checked-in');
    expect(mocks.checkIn).toHaveBeenCalledWith('e2', 'checked-in');
  });

  it('names the class that failed instead of claiming success', async () => {
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
    await waitFor(() => expect(screen.getByText('Check-in failed')).toBeInTheDocument());
    expect(screen.queryByText(/Checked in to/)).not.toBeInTheDocument();
  });

  it('links each class to its entry list', () => {
    mocks.dogs = [dog({ key: 'd1', dogName: 'Zip', entries: [classEntry('e1', 'checked-in')] })];
    renderRoutes('/at-show/s1/dogs/d1');
    expect(screen.getByRole('link', { name: /Open Class e1 entry list/ })).toHaveAttribute(
      'href',
      '/at-show/s1/class/c-e1'
    );
  });
});
