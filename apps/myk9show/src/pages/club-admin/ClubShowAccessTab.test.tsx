/**
 * The Show Access tab exists for exactly one case the members roster cannot render: a
 * person appointed to run the club's shows who has no club_members row. Every
 * assertion here is aimed at that case, because a tab that only ever showed members
 * would be a second copy of the roster and worth deleting.
 *
 * Rendered output, not the pure list — the shape that has repeatedly shipped inert in
 * this repo is a correct model with a projection that drops the field on the way to
 * the screen.
 */
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ClubShowAccessTab, AppointSecretaryDialog } from './ClubShowAccessTab';
import type { ClubShowManager } from '@/services/database/club-memberships';
import type { User } from '@/types/user-types';
import type { RoleRequest } from '@/services/database/role-requests';

const memberSecretary: ClubShowManager = {
  personId: 'p-member',
  personName: 'Ada Lovelace',
  personEmail: 'ada@example.com',
  isClubMember: true,
  membershipStatus: 'active',
};

const nonMemberSecretary: ClubShowManager = {
  personId: 'p-hired',
  personName: 'Grace Hopper',
  personEmail: 'grace@example.com',
  isClubMember: false,
  membershipStatus: null,
};

const lapsedSecretary: ClubShowManager = {
  personId: 'p-lapsed',
  personName: 'Alan Turing',
  personEmail: 'alan@example.com',
  isClubMember: true,
  membershipStatus: 'lapsed',
};

const pendingRequest: RoleRequest = {
  id: 'request-1',
  authUserId: 'auth-1',
  personId: 'person-1',
  requestedRole: 'secretary',
  requestedScope: 'club',
  clubId: 'club-1',
  clubName: 'Heartland Scent Work Club',
  showId: null,
  status: 'pending',
  requesterNote: 'I run entries for this club at in-person shows.',
  reviewerNote: null,
  reviewedBy: null,
  reviewerName: null,
  reviewerEmail: null,
  reviewedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  requesterName: 'Grace Hopper',
  requesterEmail: 'grace@example.com',
};

function renderTab(overrides: Partial<React.ComponentProps<typeof ClubShowAccessTab>> = {}) {
  return render(
    <ClubShowAccessTab
      managers={[memberSecretary, nonMemberSecretary]}
      unavailable={false}
      onRetry={() => {}}
      onAppoint={() => {}}
      onRevoke={() => {}}
      upcomingShowCount={0}
      pendingRequests={[]}
      requestsUnavailable={false}
      onRetryRequests={() => {}}
      onApproveRequest={() => {}}
      onDenyRequest={() => {}}
      isSavingRequest={false}
      {...overrides}
    />
  );
}

describe('ClubShowAccessTab', () => {
  it('lists an appointee who is not a club member', async () => {
    // The whole reason the tab exists. This person has no roster row, so before this
    // tab they were invisible in the club admin UI and could not be revoked.
    renderTab();

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Not a club member')).toBeInTheDocument();
  });

  it('does not label a member as a non-member', async () => {
    renderTab();

    // One badge, on the right person — not "everyone looks external".
    expect(screen.getAllByText('Not a club member')).toHaveLength(1);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('shows a lapsed membership as status, not as a problem', async () => {
    // A lapsed member who is still appointed is a normal state now. Rendering it as a
    // warning would re-teach the rule the permission change removed.
    renderTab({ managers: [lapsedSecretary] });

    expect(screen.getByText('Lapsed')).toBeInTheDocument();
    expect(screen.queryByText('Not a club member')).toBeNull();
  });

  it('revokes the person whose row was clicked', async () => {
    const revoked: string[] = [];
    const user = userEvent.setup();
    renderTab({ onRevoke: personId => revoked.push(personId) });

    const buttons = screen.getAllByRole('button', { name: /revoke/i });
    await user.click(buttons[1]!);

    expect(revoked).toEqual(['p-hired']);
  });

  it('never renders a failed lookup as "nobody has access"', async () => {
    // An empty list is a claim the tab cannot support when the query failed, and it is
    // the claim most likely to be acted on.
    renderTab({ unavailable: true, managers: [] });

    expect(screen.getByRole('status')).toHaveTextContent(/isn't the same as nobody having it/i);
    expect(screen.queryByText(/Nobody is appointed/)).toBeNull();
  });

  it('still shows pending requests when the SEPARATE managers fetch failed (MYK9-571 round 2, P2-1)', async () => {
    // The pending-requests section has its own unavailable/retry handling and is fed
    // by a different query than managers — a managers-fetch failure must not hide it,
    // or the tab's own pending-count badge would be advertising a section that never
    // renders.
    renderTab({ unavailable: true, managers: [], pendingRequests: [pendingRequest] });

    expect(screen.getByRole('status')).toHaveTextContent(/isn't the same as nobody having it/i);
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('warns when a club with upcoming shows has nobody appointed', async () => {
    renderTab({ managers: [], upcomingShowCount: 3 });

    expect(screen.getByRole('status')).toHaveTextContent(/3 upcoming shows and nobody appointed/i);
  });

  it('warns before the last secretary is revoked', async () => {
    renderTab({ managers: [nonMemberSecretary], upcomingShowCount: 2 });

    expect(screen.getByText(/only appointed secretary/i)).toBeInTheDocument();
  });

  it('stays quiet about the last secretary when no shows are upcoming', async () => {
    renderTab({ managers: [nonMemberSecretary], upcomingShowCount: 0 });

    expect(screen.queryByText(/only appointed secretary/i)).toBeNull();
  });
});

const people: User[] = [
  { id: 'p-member', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
  { id: 'p-outsider', firstName: 'Katherine', lastName: 'Johnson', email: 'kj@example.com' },
] as unknown as User[];

describe('AppointSecretaryDialog', () => {
  it('offers people who are not club members', async () => {
    // The picker must NOT be filtered to the roster. Filtering it to members is the
    // exact bug this work removes from the database, reintroduced in the client.
    render(
      <AppointSecretaryDialog
        open
        onClose={() => {}}
        onAppoint={() => {}}
        people={people}
        appointedIds={new Set()}
        isSaving={false}
      />
    );

    expect(await screen.findByText('Katherine Johnson')).toBeInTheDocument();
  });

  it('says membership is not required', async () => {
    render(
      <AppointSecretaryDialog
        open
        onClose={() => {}}
        onAppoint={() => {}}
        people={people}
        appointedIds={new Set()}
        isSaving={false}
      />
    );

    expect(await screen.findByText(/Club membership is not required/i)).toBeInTheDocument();
  });

  it('hides people who are already appointed', async () => {
    render(
      <AppointSecretaryDialog
        open
        onClose={() => {}}
        onAppoint={() => {}}
        people={people}
        appointedIds={new Set(['p-member'])}
        isSaving={false}
      />
    );

    expect(await screen.findByText('Katherine Johnson')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).toBeNull();
  });

  it('appoints the selected person', async () => {
    const appointed: string[] = [];
    const user = userEvent.setup();
    render(
      <AppointSecretaryDialog
        open
        onClose={() => {}}
        onAppoint={personId => appointed.push(personId)}
        people={people}
        appointedIds={new Set()}
        isSaving={false}
      />
    );

    await user.click(await screen.findByText('Katherine Johnson'));
    await user.click(screen.getByRole('button', { name: /^appoint$/i }));

    expect(appointed).toEqual(['p-outsider']);
  });
});
