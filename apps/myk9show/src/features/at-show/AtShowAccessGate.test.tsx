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
let mockLoading = false;
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
    loading: mockLoading,
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
    mockLoading = false;
    mockAccountToday.hasAccountEntryForShow = false;
    mockAccountToday.isLoading = false;
    mockAccountToday.error = null;
    mockHasAnyEntry.hasAnyEntryForShow = false;
    mockHasAnyEntry.isLoading = false;
    useRingsideGrantStore.getState().clearGrant();
    useRingsideGrantStore.getState().setSuppressRehydration(false);
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

  // exhibitor-show-day-access (D9): a signed-in user with no grant, staff role,
  // or entry is never shown the passcode form — they get an account-voiced
  // explanatory state pointing at My Shows. The passcode prompt is reserved for
  // anonymous / explicit `?passcode=1` flows (handled outside this gate).
  it('gives a signed-in visitor with no entry an explanatory state, never a passcode prompt', () => {
    mockUser = { id: 'user-1' };
    mockRoles = [UserRole.EXHIBITOR];
    mockHasAnyEntry.hasAnyEntryForShow = false;

    renderGate();

    expect(screen.getByText("You don't have ringside access for this show.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to my shows/i })).toBeInTheDocument();
    // No passcode affordance for authenticated users on this path.
    expect(screen.queryByText(/enter passcode/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/passcode/i)).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/at-show?passcode=1"]')).not.toBeInTheDocument();
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

  // Closes the revocation race: ringsidePasscodeRevocation.ts clears the
  // grant and sets suppressRehydration synchronously, but the anon session's
  // claim isn't actually invalidated until its async signOut() resolves.
  // Without the flag, this hook would see "no grant, valid-shaped claim" in
  // that gap and immediately re-admit the just-revoked user.
  it('does not rehydrate while suppressRehydration is set, even with a valid-shaped claim', () => {
    mockUser = {
      is_anonymous: true,
      app_metadata: { kind: 'ringside_passcode', show_id: 'show-1', ringside_role: 'judge' },
    };
    useRingsideGrantStore.getState().setSuppressRehydration(true);

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

  // exhibitor-show-day-access (D9): the passcode form is reserved for anonymous
  // / `?passcode=1` flows. An anonymous visitor without a grant is sent to
  // sign-in (unchanged) — this gate never renders a passcode prompt for them.
  it('redirects an anonymous visitor without a grant to sign-in (passcode flow unchanged)', () => {
    mockUser = null;

    renderGate();

    expect(screen.getByText('SIGN IN PAGE')).toBeInTheDocument();
    expect(
      screen.queryByText("You don't have ringside access for this show.")
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/passcode/i)).not.toBeInTheDocument();
  });

  // exhibitor-show-day-access (D9): the gate waits for RBAC role resolution
  // before rendering any restricted/passcode state, so staff never flash the
  // deny copy while roles are still loading (RBAC reloads on a 60s poll).
  it('shows a loading state (never the deny/passcode copy) while RBAC roles are still loading for staff', () => {
    mockUser = { id: 'user-1' };
    mockRoles = []; // RBAC not yet resolved — role will arrive once loading clears
    mockLoading = true;

    renderGate();

    expect(screen.getByRole('status', { name: 'Checking ringside access…' })).toBeInTheDocument();
    expect(
      screen.queryByText("You don't have ringside access for this show.")
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/passcode/i)).not.toBeInTheDocument();
    expect(screen.queryByText('AT SHOW CONTENT')).not.toBeInTheDocument();
  });

  it('admits staff once RBAC resolves after the loading window', () => {
    mockUser = { id: 'user-1' };
    mockRoles = [UserRole.SECRETARY];
    mockLoading = false;

    renderGate();

    expect(screen.getByText('AT SHOW CONTENT')).toBeInTheDocument();
  });
});
