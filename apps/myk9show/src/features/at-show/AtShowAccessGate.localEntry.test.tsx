/**
 * MYK9-1346: the gate admits an exhibitor whose replica already holds an entry
 * for this show while the server RPC is still loading, and closes again if the
 * server then says no. A cold device keeps waiting.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { AtShowAccessGate } from './AtShowAccessGate';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';

let mockUser: { id?: string; is_anonymous?: boolean } | null = null;
let mockRoles: UserRole[] = [];
const mockAccountToday = vi.hoisted(() => ({
  hasAccountEntryForShow: false,
  isLoading: false,
  isFetched: true,
  error: null as Error | null,
}));
const mockHasAnyEntry = vi.hoisted(() => ({
  hasAnyEntryForShow: false,
  isLoading: false,
  isError: false,
}));
const mockLocal = vi.hoisted(() => ({
  hasLocalEntryToday: false,
  isLoading: false,
  calls: [] as Array<[string | null, string | undefined]>,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: mockUser,
    loading: false,
    hasRole: (role: UserRole) => mockRoles.includes(role),
  }),
}));

vi.mock('@/hooks/useEntriesPersonId', () => ({
  useEntriesPersonId: () => 'person-1',
}));

vi.mock('@/features/show-today/accountTodayEntries', () => ({
  useAccountTodayAutoFavorites: () => mockAccountToday,
}));

vi.mock('./useHasAnyEntryForShow', () => ({
  useHasAnyEntryForShow: () => mockHasAnyEntry,
}));

vi.mock('./useLocalEntryForShowToday', () => ({
  useLocalEntryForShowToday: (personId: string | null, showId: string | undefined) => {
    mockLocal.calls.push([personId, showId]);
    return mockLocal;
  },
}));

function gate() {
  return (
    <Routes>
      <Route
        path="/at-show/:showId"
        element={
          <AtShowAccessGate>
            <div>AT SHOW CONTENT</div>
          </AtShowAccessGate>
        }
      />
      <Route path="/sign-in" element={<div>SIGN IN PAGE</div>} />
    </Routes>
  );
}

const renderGate = () => render(gate(), { initialRoute: '/at-show/show-1' });

describe('AtShowAccessGate local entry admission', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1' };
    mockRoles = [UserRole.EXHIBITOR];
    mockAccountToday.hasAccountEntryForShow = false;
    mockAccountToday.isLoading = false;
    mockAccountToday.isFetched = true;
    mockAccountToday.error = null;
    mockHasAnyEntry.hasAnyEntryForShow = false;
    mockHasAnyEntry.isLoading = false;
    mockHasAnyEntry.isError = false;
    mockLocal.hasLocalEntryToday = false;
    mockLocal.isLoading = false;
    mockLocal.calls = [];
    useRingsideGrantStore.getState().clearGrant();
    useRingsideGrantStore.getState().setSuppressRehydration(false);
  });

  it('admits a warm device while the server RPC is still loading', () => {
    mockAccountToday.isLoading = true;
    mockAccountToday.isFetched = false;
    mockLocal.hasLocalEntryToday = true;

    renderGate();

    expect(screen.getByText('AT SHOW CONTENT')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mockLocal.calls).toContainEqual(['person-1', 'show-1']);
  });

  it('keeps a cold device on the spinner while the server RPC is loading', () => {
    mockAccountToday.isLoading = true;
    mockAccountToday.isFetched = false;
    mockLocal.hasLocalEntryToday = false;

    renderGate();

    expect(screen.getByRole('status', { name: 'Checking ringside access…' })).toBeInTheDocument();
    expect(screen.queryByText('AT SHOW CONTENT')).not.toBeInTheDocument();
  });

  it('closes the gate when the server says no after a local yes', () => {
    mockAccountToday.isLoading = true;
    mockAccountToday.isFetched = false;
    mockLocal.hasLocalEntryToday = true;
    mockHasAnyEntry.hasAnyEntryForShow = true;
    const { rerender } = renderGate();
    expect(screen.getByText('AT SHOW CONTENT')).toBeInTheDocument();

    mockAccountToday.isLoading = false;
    mockAccountToday.isFetched = true;
    mockAccountToday.hasAccountEntryForShow = false;
    rerender(gate());

    expect(screen.queryByText('AT SHOW CONTENT')).not.toBeInTheDocument();
    expect(screen.getByText("Ringside isn't open for this show yet.")).toBeInTheDocument();
  });

  it('admits a warm device while the RPC is paused because the device is offline', () => {
    mockAccountToday.isLoading = false;
    mockAccountToday.isFetched = false;
    mockAccountToday.error = null;
    mockAccountToday.hasAccountEntryForShow = false;
    mockLocal.hasLocalEntryToday = true;

    renderGate();

    expect(screen.getByText('AT SHOW CONTENT')).toBeInTheDocument();
  });

  it('closes the gate on a settled server no, even with a local yes', () => {
    mockAccountToday.isLoading = false;
    mockAccountToday.isFetched = true;
    mockAccountToday.error = null;
    mockAccountToday.hasAccountEntryForShow = false;
    mockLocal.hasLocalEntryToday = true;
    mockHasAnyEntry.hasAnyEntryForShow = true;

    renderGate();

    expect(screen.queryByText('AT SHOW CONTENT')).not.toBeInTheDocument();
    expect(screen.getByText("Ringside isn't open for this show yet.")).toBeInTheDocument();
  });

  it('keeps the local admission when the server read errors after a local yes', () => {
    mockAccountToday.isLoading = false;
    mockAccountToday.isFetched = true;
    mockAccountToday.error = new Error('offline');
    mockLocal.hasLocalEntryToday = true;

    renderGate();

    expect(screen.getByText('AT SHOW CONTENT')).toBeInTheDocument();
  });

  it('does not admit a cold device when the server read errors', () => {
    mockAccountToday.isLoading = false;
    mockAccountToday.isFetched = true;
    mockAccountToday.error = new Error('offline');
    mockLocal.hasLocalEntryToday = false;
    mockHasAnyEntry.isError = true;

    renderGate();

    expect(screen.queryByText('AT SHOW CONTENT')).not.toBeInTheDocument();
    expect(screen.getByText(/couldn't confirm your entries/i)).toBeInTheDocument();
  });

  it('still redirects an anonymous user to sign-in even with a local entry', () => {
    mockUser = null;
    mockAccountToday.isLoading = true;
    mockAccountToday.isFetched = false;
    mockLocal.hasLocalEntryToday = true;

    renderGate();

    expect(screen.getByText('SIGN IN PAGE')).toBeInTheDocument();
    expect(screen.queryByText('AT SHOW CONTENT')).not.toBeInTheDocument();
  });

  it('does not ask the replica about a passcode-grant user, who is admitted anyway', () => {
    mockUser = { is_anonymous: true };
    mockRoles = [];
    mockLocal.hasLocalEntryToday = false;
    useRingsideGrantStore
      .getState()
      .setGrant({ showId: 'show-1', role: 'judge', source: 'passcode' });

    renderGate();

    expect(screen.getByText('AT SHOW CONTENT')).toBeInTheDocument();
    expect(mockLocal.calls.every(([personId]) => personId === null)).toBe(true);
  });

  it('does not ask the replica about a staff user, who is admitted anyway', () => {
    mockRoles = [UserRole.STEWARD];

    renderGate();

    expect(screen.getByText('AT SHOW CONTENT')).toBeInTheDocument();
    expect(mockLocal.calls.every(([personId]) => personId === null)).toBe(true);
  });
});
