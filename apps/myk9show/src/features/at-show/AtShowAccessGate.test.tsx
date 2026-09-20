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
  isError: false,
  identityState: 'resolved' as 'resolved' | 'unresolved' | 'missing',
  hasUsablePersonId: true,
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
    mockHasAnyEntry.isError = false;
    mockHasAnyEntry.identityState = 'resolved';
    mockHasAnyEntry.hasUsablePersonId = true;
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
    mockAccountToday.isLoading = true;
    mockHasAnyEntry.isLoading = true;
    mockHasAnyEntry.identityState = 'unresolved';

    renderGate();

    expect(screen.getByText('AT SHOW CONTENT')).toBeInTheDocument();
  });

  it('admits a passcode grant even when exhibitor identity is unresolved', () => {
    mockAccountToday.isLoading = true;
    mockHasAnyEntry.isLoading = true;
    mockHasAnyEntry.identityState = 'unresolved';
    useRingsideGrantStore
      .getState()
      .setGrant({ showId: 'show-1', role: 'judge', source: 'passcode' });

    renderGate();

    expect(screen.getByText('AT SHOW CONTENT')).toBeInTheDocument();
  });

  it('admits a signed-in exhibitor with account entries today', () => {
    mockUser = { id: 'user-1' };
    mockRoles = [UserRole.EXHIBITOR];
    mockAccountToday.hasAccountEntryForShow = true;
    mockHasAnyEntry.identityState = 'unresolved';
    mockHasAnyEntry.hasUsablePersonId = true;

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
    mockAccountToday.isLoading = true;
    mockHasAnyEntry.hasAnyEntryForShow = true;
    mockHasAnyEntry.identityState = 'unresolved';
    mockHasAnyEntry.hasUsablePersonId = true;

    renderGate();

    expect(screen.getByText("Ringside isn't open for this show yet.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to my shows/i })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Checking ringside access…' })).not.toBeInTheDocument();
    expect(
      screen.queryByText("You don't have ringside access for this show.")
    ).not.toBeInTheDocument();
  });

  // exhibitor-show-day-access (D9): a signed-in user with no grant, staff role,
  // or entry is never shown the passcode FORM — they get an account-voiced
  // explanatory state pointing at My Shows. The form itself stays reserved for
  // anonymous / explicit `?passcode=1` flows (handled outside this gate).
  it('gives a signed-in visitor with no entry an explanatory state, never the passcode form', () => {
    mockUser = { id: 'user-1' };
    mockRoles = [UserRole.EXHIBITOR];
    mockHasAnyEntry.hasAnyEntryForShow = false;

    renderGate();

    expect(screen.getByText("You don't have ringside access for this show.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to my shows/i })).toBeInTheDocument();
    // The gate itself never renders a passcode INPUT — only a link into the
    // explicit `?passcode=1` flow, asserted separately below.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('keeps an exhibitor in a pending identity state instead of showing stranger copy', () => {
    mockUser = { id: 'user-1' };
    mockRoles = [UserRole.EXHIBITOR];
    mockHasAnyEntry.identityState = 'unresolved';
    mockHasAnyEntry.hasUsablePersonId = false;

    renderGate();

    expect(screen.getByText('Still confirming your account.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to my shows/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /show-day passcode/i })).toBeInTheDocument();
    expect(screen.queryByText("You don't have ringside access for this show.")).not.toBeInTheDocument();
  });

  it('explains a confirmed missing profile while preserving the passcode path', () => {
    mockUser = { id: 'user-1' };
    mockRoles = [UserRole.EXHIBITOR];
    mockHasAnyEntry.identityState = 'missing';
    mockHasAnyEntry.hasUsablePersonId = false;

    renderGate();

    expect(screen.getByText("We couldn't find your exhibitor profile.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /show-day passcode/i })).toBeInTheDocument();
  });

  // A signed-in exhibitor volunteering as a steward at a show they have no
  // entry in lands on THIS branch (deep link from a ring QR or the secretary),
  // and a passcode is their only route in. D9 originally withheld the link
  // here while offering it on the entered-exhibitor branch, dead-ending the
  // person most likely to be holding one.
  it('offers a signed-in visitor with no entry a link into the passcode flow', () => {
    mockUser = { id: 'user-1' };
    mockRoles = [UserRole.EXHIBITOR];
    mockHasAnyEntry.hasAnyEntryForShow = false;

    renderGate();

    const passcodeLink = screen.getByRole('link', { name: /show-day passcode/i });
    expect(passcodeLink).toHaveAttribute('href', '/at-show?passcode=1');
  });

  it('still offers the passcode link to an entered exhibitor visiting early', () => {
    mockUser = { id: 'user-1' };
    mockRoles = [UserRole.EXHIBITOR];
    mockHasAnyEntry.hasAnyEntryForShow = true;

    renderGate();

    expect(screen.getByRole('link', { name: /show-day passcode/i })).toHaveAttribute(
      'href',
      '/at-show?passcode=1'
    );
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

  // MYK9-629 restructure 3. `hasAnyEntryForShow: false` after a FAILED read is
  // an absence of knowledge, and the branch it used to fall into speaks to a
  // stranger: "You don't have ringside access for this show." An entered
  // exhibitor standing at the ring on dead venue wifi was being told they had no
  // relationship to the show they had paid to enter.
  it('says the entry check FAILED instead of calling an entered exhibitor a stranger', () => {
    mockUser = { id: 'user-1' };
    mockRoles = [UserRole.EXHIBITOR];
    mockHasAnyEntry.hasAnyEntryForShow = false;
    mockHasAnyEntry.isLoading = false;
    mockHasAnyEntry.isError = true;

    renderGate();

    expect(screen.getByText(/couldn't confirm your entries/i)).toBeInTheDocument();
    // The claim the old copy made about this exhibitor, which it could not back.
    expect(
      screen.queryByText("You don't have ringside access for this show.")
    ).not.toBeInTheDocument();
    // Both doors stay open: retry via My Shows, or a passcode if they have one.
    expect(screen.getByRole('link', { name: /go to my shows/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /show-day passcode/i })).toBeInTheDocument();
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
