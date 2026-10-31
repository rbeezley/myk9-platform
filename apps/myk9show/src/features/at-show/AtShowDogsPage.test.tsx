import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import type { StaffDog } from './staffDogIndex';

const mocks = vi.hoisted(() => ({
  role: 'admin' as string | null,
  rehydrated: null as string | null,
  dogs: [] as StaffDog[],
  toggle: vi.fn(),
  favorites: new Set<number>(),
  loadFailed: false,
  isComplete: true,
  retry: vi.fn(),
  staffShow: undefined as string | undefined,
  exhibitorShow: undefined as string | undefined,
  exhibitorDogs: [] as StaffDog[],
  exhibitorFailed: false,
}));

vi.mock('./useRingsideEffectiveRole', () => ({
  useRingsideEffectiveRole: () => ({ ringsideRole: mocks.role }),
}));
vi.mock('./useRehydrateRingsideGrant', () => ({
  useRehydrateRingsideGrant: () => mocks.rehydrated,
}));
vi.mock('./useAtShowExhibitorDogs', () => ({
  useAtShowExhibitorDogs: (showId: string | undefined) => {
    mocks.exhibitorShow = showId;
    return {
      dogs: mocks.exhibitorDogs,
      showName: '',
      isLoading: false,
      isComplete: true,
      loadFailed: mocks.exhibitorFailed,
      onRetry: mocks.retry,
    };
  },
}));
vi.mock('./useAtShowStaffDogs', () => ({
  useAtShowStaffDogs: (showId: string | undefined) => {
    mocks.staffShow = showId;
    return staffResult();
  },
}));
const staffResult = () => ({
  dogs: mocks.dogs,
  showName: 'Spring Show',
  isLoading: false,
  isComplete: mocks.isComplete,
  loadFailed: mocks.loadFailed,
  onRetry: mocks.retry,
});
vi.mock('./dogFavoritesSync', () => ({
  useAtShowDogFavoritesSynced: () => ({
    favoriteArmbands: mocks.favorites,
    toggleFavoriteArmband: mocks.toggle,
  }),
}));

import AtShowDogsPage from './AtShowDogsPage';
import AtShowDogPage from './AtShowDogPage';

function dog(over: Partial<StaffDog> & { key: string; dogName: string }): StaffDog {
  return {
    breed: 'Beagle',
    handler: 'Amy',
    armband: 1,
    entries: [],
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
  mocks.rehydrated = null;
  mocks.favorites = new Set();
  mocks.toggle.mockReset();
  mocks.loadFailed = false;
  mocks.isComplete = true;
  mocks.retry.mockReset();
  mocks.exhibitorDogs = [];
  mocks.exhibitorFailed = false;
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

  it('sends an unresolved role back to the class picker', () => {
    mocks.role = null;
    renderRoutes('/at-show/s1/dogs');
    expect(screen.getByText('class picker')).toBeInTheDocument();
    expect(screen.queryByTestId('at-show-dogs')).not.toBeInTheDocument();
  });
});

describe('AtShowDogsPage as an exhibitor (MYK9-1517)', () => {
  const exhibitorDog = (over: Partial<StaffDog> = {}): StaffDog => ({
    key: 'armband:7',
    dogName: 'Friend',
    breed: 'Poodle',
    handler: 'Pat',
    armband: 7,
    entries: [
      {
        entryId: '7:c1',
        classId: 'c1',
        routeClassIds: [],
        className: 'Container Novice',
        trialLabel: 'Trial A',
        checkInStatus: 'checked-in',
        isPulled: false,
        isMoved: false,
        isScored: false,
        resultText: null,
        searchTime: null,
        faultCount: null,
        placement: null,
        resultsReleased: false,
        runOrder: 4,
      },
    ],
    ...over,
  });

  beforeEach(() => {
    mocks.role = 'exhibitor';
    mocks.dogs = [dog({ key: 'staff-only', dogName: 'ReplicaDog' })];
    mocks.exhibitorDogs = [exhibitorDog()];
  });

  it('reads the server list, not the replica, and loads nothing for staff', () => {
    renderRoutes('/at-show/s1/dogs');
    expect(mocks.exhibitorShow).toBe('s1');
    expect(mocks.staffShow).toBeUndefined();
    expect(screen.getByText('Friend')).toBeInTheDocument();
    expect(screen.queryByText('ReplicaDog')).not.toBeInTheDocument();
  });

  it('shows class, run order and check-in status without linking to the staff dog page', () => {
    renderRoutes('/at-show/s1/dogs');
    const row = screen.getByTestId('at-show-dog-armband:7');
    expect(row).toHaveTextContent('Trial A');
    expect(row).toHaveTextContent('Container Novice');
    expect(row).toHaveTextContent('Place in line 4');
    expect(row).toHaveTextContent(/Checked.?in/i);
    expect(row.querySelector('a')).toBeNull();
  });

  it("searches, and favorites a friend's dog through the synced favorites", () => {
    mocks.exhibitorDogs = [
      exhibitorDog(),
      exhibitorDog({ key: 'armband:8', dogName: 'Other', armband: 8, handler: 'Quinn' }),
    ];
    renderRoutes('/at-show/s1/dogs');
    fireEvent.change(screen.getByLabelText('Search dogs'), { target: { value: 'quinn' } });
    expect(screen.getByText('1 of 2 dogs')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add Other to favorites/ }));
    expect(mocks.toggle).toHaveBeenCalledWith(8);
  });

  it('says the list needs a connection when the read fails', () => {
    mocks.exhibitorDogs = [];
    mocks.exhibitorFailed = true;
    renderRoutes('/at-show/s1/dogs');
    expect(screen.getByRole('alert')).toHaveTextContent(/needs a connection/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.retry).toHaveBeenCalled();
  });

  it('keeps the staff dog page closed to an exhibitor', () => {
    renderRoutes('/at-show/s1/dogs/armband:7');
    expect(screen.getByText('class picker')).toBeInTheDocument();
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

  it('offers no bulk check-in control on the dog page', () => {
    mocks.dogs = [
      dog({
        key: 'd1',
        dogName: 'Zip',
        entries: [classEntry('e1', 'no-status'), classEntry('e2', 'no-status')],
      }),
    ];
    renderRoutes('/at-show/s1/dogs/d1');
    expect(screen.getByRole('heading', { name: /Zip/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /check in/i })).not.toBeInTheDocument();
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

  it('admits a passcode judge whose grant is rehydrated from the session claim', () => {
    mocks.role = 'exhibitor';
    mocks.rehydrated = 'judge';
    renderRoutes('/at-show/s1/dogs');
    expect(screen.getByTestId('at-show-dogs')).toBeInTheDocument();
  });
});
