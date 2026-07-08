import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { AtShowAccessGate } from './AtShowAccessGate';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';

let mockUser: { id: string } | null = null;
let mockRoles: UserRole[] = [];
const mockAccountToday = vi.hoisted(() => ({
  hasAccountEntryForShow: false,
  isLoading: false,
  error: null as Error | null,
}));
const mockHasAnyEntry = vi.hoisted(() => ({
  hasAnyEntryForShow: false,
  isLoading: false,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: mockUser,
    loading: false,
    hasRole: (role: UserRole) => mockRoles.includes(role),
  }),
}));

vi.mock('@/features/show-today/accountTodayEntries', () => ({
  useAccountTodayAutoFavorites: () => mockAccountToday,
}));

vi.mock('./useHasAnyEntryForShow', () => ({
  useHasAnyEntryForShow: () => mockHasAnyEntry,
}));

function renderGate(initialRoute = '/at-show/show-1') {
  return render(
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
    </Routes>,
    { initialRoute }
  );
}

describe('AtShowAccessGate', () => {
  beforeEach(() => {
    mockUser = null;
    mockRoles = [];
    mockAccountToday.hasAccountEntryForShow = false;
    mockAccountToday.isLoading = false;
    mockAccountToday.error = null;
    mockHasAnyEntry.hasAnyEntryForShow = false;
    mockHasAnyEntry.isLoading = false;
    useRingsideGrantStore.getState().clearGrant();
  });

  it('admits an anonymous user with a matching passcode grant', () => {
    useRingsideGrantStore
      .getState()
      .setGrant({ showId: 'show-1', role: 'judge', source: 'passcode' });

    renderGate();

    expect(screen.getByText('AT SHOW CONTENT')).toBeInTheDocument();
  });

  it('admits signed-in staff without a passcode grant', () => {
    mockUser = { id: 'user-1' };
    mockRoles = [UserRole.STEWARD];

    renderGate();

    expect(screen.getByText('AT SHOW CONTENT')).toBeInTheDocument();
  });

  it('admits a signed-in exhibitor with account entries today', () => {
    mockUser = { id: 'user-1' };
    mockRoles = [UserRole.EXHIBITOR];
    mockAccountToday.hasAccountEntryForShow = true;

    renderGate();

    expect(screen.getByText('AT SHOW CONTENT')).toBeInTheDocument();
  });

  it('blocks a signed-in exhibitor when the grant is for another show', () => {
    mockUser = { id: 'user-1' };
    mockRoles = [UserRole.EXHIBITOR];
    useRingsideGrantStore
      .getState()
      .setGrant({ showId: 'other-show', role: 'judge', source: 'passcode' });

    renderGate();

    expect(screen.getByText("You don't have ringside access for this show.")).toBeInTheDocument();
  });

  // exhibitor-show-day-access
  it('gives an entered exhibitor visiting before show day exhibitor-voiced guidance, not a passcode prompt', () => {
    mockUser = { id: 'user-1' };
    mockRoles = [UserRole.EXHIBITOR];
    mockHasAnyEntry.hasAnyEntryForShow = true;

    renderGate();

    expect(screen.getByText("Ringside isn't open for this show yet.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to my shows/i })).toBeInTheDocument();
    expect(
      screen.queryByText("You don't have ringside access for this show.")
    ).not.toBeInTheDocument();
  });

  it('shows both audiences to a visitor with no entries and no access', () => {
    mockUser = { id: 'user-1' };
    mockRoles = [UserRole.EXHIBITOR];
    mockHasAnyEntry.hasAnyEntryForShow = false;

    renderGate();

    expect(screen.getByText("You don't have ringside access for this show.")).toBeInTheDocument();
    expect(screen.getByText(/Entered this show\?.*Working the show\?/i)).toBeInTheDocument();
  });
});
