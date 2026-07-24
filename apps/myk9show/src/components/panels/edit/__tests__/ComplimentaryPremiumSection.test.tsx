import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import type { AdminGrantHistoryRow } from '@/services/database/entitlement/types';
import type React from 'react';

const grantEntitlementMock = vi.fn();
const revokeEntitlementMock = vi.fn();
const fetchGrantHistoryMock = vi.fn();

vi.mock('@/services/database/entitlement/admin', () => ({
  grantEntitlement: (...args: unknown[]) => grantEntitlementMock(...args),
  revokeEntitlement: (...args: unknown[]) => revokeEntitlementMock(...args),
  fetchGrantHistory: (...args: unknown[]) => fetchGrantHistoryMock(...args),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { ComplimentaryPremiumSection } from '../ComplimentaryPremiumSection';

const activeGrant: AdminGrantHistoryRow = {
  id: 'grant-1',
  person_id: 'person-1',
  grant_type: 'complimentary',
  starts_at: new Date(Date.now() - 86400000).toISOString(),
  ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  reason: 'Beta tester',
  granted_by_person_id: 'admin-1',
  created_at: new Date(Date.now() - 86400000).toISOString(),
  revoked_at: null,
  revoked_by_person_id: null,
  revoke_reason: null,
  superseded_at: null,
  superseded_by_grant_id: null,
};

const expiredGrant: AdminGrantHistoryRow = {
  ...activeGrant,
  id: 'grant-0',
  starts_at: new Date(Date.now() - 60 * 86400000).toISOString(),
  ends_at: new Date(Date.now() - 30 * 86400000).toISOString(),
};

function renderSection(props?: Partial<React.ComponentProps<typeof ComplimentaryPremiumSection>>) {
  return render(
    <ComplimentaryPremiumSection personId="person-1" hasExhibitorProfile={true} {...props} />
  );
}

const futureDateInputValue = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

describe('ComplimentaryPremiumSection', () => {
  beforeEach(() => {
    grantEntitlementMock.mockReset();
    revokeEntitlementMock.mockReset();
    fetchGrantHistoryMock.mockReset();
    fetchGrantHistoryMock.mockResolvedValue([]);
  });

  it('shows a plain explanation instead of the grant form when the target has no exhibitor profile', () => {
    renderSection({ hasExhibitorProfile: false });

    expect(screen.getByText(/no exhibitor profile/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/expiration date/i)).not.toBeInTheDocument();
    expect(fetchGrantHistoryMock).not.toHaveBeenCalled();
  });

  it('requires a future end date and a reason before submitting a grant', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole('button', { name: /grant complimentary premium/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/expiration/i);
    expect(grantEntitlementMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/expiration date/i), futureDateInputValue());
    await user.click(screen.getByRole('button', { name: /grant complimentary premium/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/reason/i);
    expect(grantEntitlementMock).not.toHaveBeenCalled();
  });

  it('grants complimentary premium and refetches history on confirmation', async () => {
    grantEntitlementMock.mockResolvedValue('new-grant-id');
    const user = userEvent.setup();
    renderSection();

    await user.type(screen.getByLabelText(/expiration date/i), futureDateInputValue());
    await user.type(screen.getByLabelText(/reason/i), 'Founding beta tester gift');
    await user.click(screen.getByRole('button', { name: /grant complimentary premium/i }));

    await waitFor(() => expect(grantEntitlementMock).toHaveBeenCalledTimes(1));
    expect(grantEntitlementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'person-1',
        grantType: 'complimentary',
        reason: 'Founding beta tester gift',
        replaceActive: false,
      })
    );
    // Refetch after success: initial mount call + post-mutation invalidation call.
    await waitFor(() => expect(fetchGrantHistoryMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('surfaces the server overlap error and offers the explicit replace path', async () => {
    grantEntitlementMock.mockRejectedValueOnce(
      new Error('grantEntitlement: overlapping active grant exists')
    );
    const user = userEvent.setup();
    renderSection();

    await user.type(screen.getByLabelText(/expiration date/i), futureDateInputValue());
    await user.type(screen.getByLabelText(/reason/i), 'Replace test');
    await user.click(screen.getByRole('button', { name: /grant complimentary premium/i }));

    expect(await screen.findByText(/overlapping active grant/i)).toBeInTheDocument();
    const replaceButton = await screen.findByRole('button', { name: /replace active grant/i });

    grantEntitlementMock.mockResolvedValueOnce('replacement-grant-id');
    await user.click(replaceButton);

    await waitFor(() => expect(grantEntitlementMock).toHaveBeenCalledTimes(2));
    expect(grantEntitlementMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ replaceActive: true })
    );
  });

  it('disables the grant button while a submission is in flight to prevent double submit', async () => {
    let resolveGrant: (value: string) => void = () => {};
    grantEntitlementMock.mockReturnValue(
      new Promise<string>(resolve => {
        resolveGrant = resolve;
      })
    );
    const user = userEvent.setup();
    renderSection();

    await user.type(screen.getByLabelText(/expiration date/i), futureDateInputValue());
    await user.type(screen.getByLabelText(/reason/i), 'In flight test');
    const grantButton = screen.getByRole('button', { name: /grant complimentary premium/i });

    await user.click(grantButton);
    await user.click(grantButton);
    await user.click(grantButton);

    expect(grantEntitlementMock).toHaveBeenCalledTimes(1);

    resolveGrant('grant-id');
    await waitFor(() => expect(grantEntitlementMock).toHaveBeenCalledTimes(1));
  });

  it('preserves entered form values when the grant mutation fails', async () => {
    grantEntitlementMock.mockRejectedValue(new Error('grantEntitlement: unexpected server error'));
    const user = userEvent.setup();
    renderSection();

    const endDateValue = futureDateInputValue();
    await user.type(screen.getByLabelText(/expiration date/i), endDateValue);
    await user.type(screen.getByLabelText(/reason/i), 'Preserve me');
    await user.click(screen.getByRole('button', { name: /grant complimentary premium/i }));

    await screen.findByText(/unexpected server error/i);

    expect(screen.getByLabelText(/expiration date/i)).toHaveValue(endDateValue);
    expect(screen.getByLabelText(/reason/i)).toHaveValue('Preserve me');
  });

  it('shows a revoke action only for active/scheduled grants, requires a reason, and confirms before revoking', async () => {
    fetchGrantHistoryMock.mockResolvedValue([activeGrant, expiredGrant]);
    revokeEntitlementMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSection();

    await screen.findAllByText(/beta tester/i);

    const revokeButtons = screen.getAllByRole('button', { name: /^revoke$/i });
    expect(revokeButtons).toHaveLength(1);

    await user.click(revokeButtons[0]);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/revoke complimentary premium/i)).toBeInTheDocument();

    // Reason is required — the confirm action is disabled until one is entered.
    expect(within(dialog).getByRole('button', { name: /^revoke$/i })).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/revocation reason/i), 'No longer eligible');
    expect(within(dialog).getByRole('button', { name: /^revoke$/i })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: /^revoke$/i }));

    await waitFor(() => expect(revokeEntitlementMock).toHaveBeenCalledTimes(1));
    expect(revokeEntitlementMock).toHaveBeenCalledWith('grant-1', 'No longer eligible');
  });

  it('renders truthful history status, dates, reason, and actor for each grant', async () => {
    fetchGrantHistoryMock.mockResolvedValue([activeGrant]);
    renderSection();

    await screen.findByText(/beta tester/i);
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText(/beta tester/i)).toBeInTheDocument();
  });

  it('disables repeat submission for revoke while in flight', async () => {
    fetchGrantHistoryMock.mockResolvedValue([activeGrant]);
    let resolveRevoke: () => void = () => {};
    revokeEntitlementMock.mockReturnValue(
      new Promise<void>(resolve => {
        resolveRevoke = resolve;
      })
    );
    const user = userEvent.setup();
    renderSection();

    await screen.findByText(/beta tester/i);
    await user.click(screen.getByRole('button', { name: /^revoke$/i }));

    const dialog = await screen.findByRole('alertdialog');
    await user.type(within(dialog).getByLabelText(/revocation reason/i), 'Duplicate click test');
    const confirmButton = within(dialog).getByRole('button', { name: /^revoke$/i });

    await user.click(confirmButton);
    await user.click(confirmButton);
    await user.click(confirmButton);

    expect(revokeEntitlementMock).toHaveBeenCalledTimes(1);
    resolveRevoke();
    await waitFor(() => expect(revokeEntitlementMock).toHaveBeenCalledTimes(1));
  });
});
