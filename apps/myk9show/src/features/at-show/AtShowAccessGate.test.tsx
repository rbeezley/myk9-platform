import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { AtShowAccessGate } from './AtShowAccessGate';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';

let mockUser: {
  id?: string;
  is_anonymous?: boolean;
  app_metadata?: Record<string, unknown>;
} | null = null;
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

  // Codex review round 3 (PR #1217): must not flash the deny copy while the
  // entry-affiliation lookup is still in flight.
  // 2026-07-10 verification walk: ringsideGrantStore is deliberately not
  // persisted, but a reload leaves the anon Supabase session (and its claim)
  // intact — the gate must rehydrate from that claim instead of hanging.
  it('rehydrates and admits a passcode judge session that survived a reload (no store grant, valid claim)', async () => {
    mockUser = {
      is_anonymous: true,
      app_metadata: { kind: 'ringside_passcode', show_id: 'show-1', ringside_role: 'judge' },
    };

    renderGate();

    expect(await screen.findByText('AT SHOW CONTENT')).toBeInTheDocument();
    expect(useRingsideGrantStore.getState().activeGrant).toMatchObject({
      showId: 'show-1',
      role: 'judge',
      source: 'passcode',
    });
  });

  it('does not rehydrate a claim scoped to a different show', () => {
    mockUser = {
      is_anonymous: true,
      app_metadata: { kind: 'ringside_passcode', show_id: 'other-show', ringside_role: 'judge' },
    };

    renderGate();

    expect(screen.getByText("You don't have ringside access for this show.")).toBeInTheDocument();
    expect(useRingsideGrantStore.getState().activeGrant).toBeNull();
  });

  it('shows a loading state (not the deny copy) while the entry lookup is pending', () => {
    mockUser = { id: 'user-1' };
    mockRoles = [UserRole.EXHIBITOR];
    mockHasAnyEntry.hasAnyEntryForShow = false;
    mockHasAnyEntry.isLoading = true;

    renderGate();

    expect(screen.getByRole('status', { name: 'Checking ringside access…' })).toBeInTheDocument();
    expect(
      screen.queryByText("You don't have ringside access for this show.")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Ringside isn't open for this show yet.")).not.toBeInTheDocument();
  });
});
