/**
 * MYK9-571 — the club-admin side of the club-routed secretary request. A
 * request is an ask; Approve must call through to the same grant path a
 * direct appointment uses (asserted at the service layer, not here — this
 * file only checks the list renders and the right id is wired to the right
 * handler).
 */
import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import type { RoleRequest } from '@/services/database/role-requests';
import { ClubShowAccessRequests } from './ClubShowAccessRequests';

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

const renderRequests = (overrides: Partial<ComponentProps<typeof ClubShowAccessRequests>> = {}) =>
  render(
    <ClubShowAccessRequests
      requests={[pendingRequest]}
      unavailable={false}
      onRetry={() => undefined}
      onApprove={() => undefined}
      onDeny={() => undefined}
      isSaving={false}
      {...overrides}
    />
  );

describe('ClubShowAccessRequests', () => {
  it('renders nothing when there are no pending requests', () => {
    const { container } = renderRequests({ requests: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it('lists a pending request with a count badge, requester and note', () => {
    renderRequests();

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('grace@example.com')).toBeInTheDocument();
    expect(screen.getByText(/I run entries for this club at in-person shows/)).toBeInTheDocument();
  });

  it('approves the exact request id when Approve is clicked', async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();
    renderRequests({ onApprove });

    await user.click(screen.getByRole('button', { name: /approve/i }));

    expect(onApprove).toHaveBeenCalledWith('request-1');
  });

  it('confirms before denying, then denies the exact request id with no note', async () => {
    const onDeny = vi.fn();
    const user = userEvent.setup();
    renderRequests({ onDeny });

    await user.click(screen.getByRole('button', { name: /^deny$/i }));
    // Anchor the confirm click to the dialog, not `.last()`/`.first()` on the page.
    const dialog = await screen.findByRole('alertdialog');
    expect(onDeny).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: /deny request/i }));

    expect(onDeny).toHaveBeenCalledWith('request-1', undefined);
  });

  it('forwards a typed deny reason to onDeny', async () => {
    const onDeny = vi.fn();
    const user = userEvent.setup();
    renderRequests({ onDeny });

    await user.click(screen.getByRole('button', { name: /^deny$/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.type(within(dialog).getByLabelText(/reason/i), 'Not enough context yet.');
    await user.click(within(dialog).getByRole('button', { name: /deny request/i }));

    expect(onDeny).toHaveBeenCalledWith('request-1', 'Not enough context yet.');
  });

  it('shows a retryable warning when requests are unavailable', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    renderRequests({ unavailable: true, onRetry });

    expect(screen.getByRole('status')).toHaveTextContent(/couldn't load pending/i);
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
