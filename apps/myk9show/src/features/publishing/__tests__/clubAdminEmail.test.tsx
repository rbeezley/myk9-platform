import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowPublishBlockers } from '../ShowPublishBlockers';
import { WizardPublishBlockers } from '../WizardPublishBlockers';
import { buildClubAdminEmail, parseClubAdminContacts } from '../clubAdminContacts';
import type { PublishBlockersState } from '../usePublishBlockers';

const harness = vi.hoisted(() => ({
  rpc: vi.fn(),
  online: true,
  canOpenPayments: false,
}));

vi.mock('@/lib/supabase', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/supabase')>();
  return { ...actual, supabase: { ...actual.supabase, rpc: harness.rpc } };
});
vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => harness.online }));
vi.mock('../usePublishBlockers', async importOriginal => ({
  ...(await importOriginal<typeof import('../usePublishBlockers')>()),
  // The real hook reports 'offline' with no blockers when the device is offline.
  useClubPublishBlockers: (): PublishBlockersState =>
    harness.online
      ? {
          state: 'ready',
          blockers: [{ key: 'payouts_not_enabled', waitingOn: 'club_admin', eta: null }],
        }
      : { state: 'offline', blockers: [] },
  usePublishBlockers: (): PublishBlockersState => ({
    state: 'ready',
    blockers: [{ key: 'payouts_not_enabled', waitingOn: 'club_admin', eta: null }],
  }),
}));
vi.mock('@/features/payments/useCanOpenClubPayments', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/payments/useCanOpenClubPayments')>()),
  useCanOpenClubPayments: () => harness.canOpenPayments,
}));

const PAT = { display_name: 'Pat Lee', email: 'pat@example.test' };
const SAM = { display_name: 'Sam Roe', email: 'sam@example.test' };

function renderBlockers() {
  return render(<ShowPublishBlockers showId="show-1" clubId="club-1" status="draft" />);
}

beforeEach(() => {
  harness.rpc.mockReset();
  harness.online = true;
  harness.canOpenPayments = false;
});

describe('payouts line names the club admins (MYK9-2208)', () => {
  it('names the admin and offers a mailto to them for someone who is not a club admin', async () => {
    harness.rpc.mockResolvedValue({ data: [PAT], error: null });
    renderBlockers();

    expect(await screen.findByText(/Waiting on Pat Lee, the club admin$/)).toBeInTheDocument();
    expect(harness.rpc).toHaveBeenCalledWith('get_show_club_admin_contacts', {
      p_show_id: 'show-1',
    });
    const link = screen.getByRole('link', { name: 'Email them the link' });
    const href = link.getAttribute('href') as string;
    expect(href.startsWith('mailto:pat@example.test?')).toBe(true);
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('subject')).toBe('Please finish setting up payouts for our show');
    expect(params.get('body')).toBe(
      `Please finish setting up payouts for our club so we can publish our show: ${window.location.origin}/clubs/club-1?tab=payments`
    );
    // She still cannot connect the bank herself: no Fix it link on the payouts line.
    expect(screen.queryByRole('link', { name: /Fix it/ })).not.toBeInTheDocument();
  });

  it('puts every admin in To and pluralises', async () => {
    harness.rpc.mockResolvedValue({ data: [PAT, SAM], error: null });
    renderBlockers();

    expect(
      await screen.findByText(/Waiting on Pat Lee and Sam Roe, the club admins$/)
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Email them the link' }).getAttribute('href')).toMatch(
      /^mailto:pat@example\.test,sam@example\.test\?/
    );
  });

  it('adds nothing for a club admin and never asks the server', async () => {
    harness.canOpenPayments = true;
    renderBlockers();

    expect(screen.getByText('Your club has not finished setting up payouts.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Email them the link' })).not.toBeInTheDocument();
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it('falls back to the plain line, with no mailto, when the read fails', async () => {
    harness.rpc.mockResolvedValue({ data: null, error: new Error('Failed to fetch') });
    renderBlockers();

    await waitFor(() => expect(harness.rpc).toHaveBeenCalled());
    expect(await screen.findByText('Waiting on your club admin')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Email them the link' })).not.toBeInTheDocument();
  });

  it('falls back when offline without asking the server', () => {
    harness.online = false;
    renderBlockers();

    expect(screen.getByText('Waiting on your club admin')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Email them the link' })).not.toBeInTheDocument();
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it('falls back when the club has no admin to name', async () => {
    harness.rpc.mockResolvedValue({ data: [], error: null });
    renderBlockers();

    await waitFor(() => expect(harness.rpc).toHaveBeenCalled());
    expect(screen.getByText('Waiting on your club admin')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Email them the link' })).not.toBeInTheDocument();
  });
});

describe('payouts line in the new-show wizard, where no show exists (MYK9-2217)', () => {
  const renderWizard = () =>
    render(
      <WizardPublishBlockers
        clubId="club-1"
        entryOpenDate="2026-06-01T12:00:00.000Z"
        entryCloseDate="2026-06-25T12:00:00.000Z"
        onEditDetails={vi.fn()}
      />
    );

  it('reads the admins by club and offers the mailto', async () => {
    harness.rpc.mockResolvedValue({ data: [PAT], error: null });
    renderWizard();

    expect(await screen.findByText(/Waiting on Pat Lee, the club admin$/)).toBeInTheDocument();
    expect(harness.rpc).toHaveBeenCalledWith('get_club_admin_contacts', { p_club_id: 'club-1' });
    expect(screen.getByRole('link', { name: 'Email them the link' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^mailto:pat@example\.test\?/)
    );
  });

  it('keeps today’s wording, with no mailto, when the read fails', async () => {
    harness.rpc.mockResolvedValue({ data: null, error: new Error('Failed to fetch') });
    renderWizard();

    await waitFor(() => expect(harness.rpc).toHaveBeenCalled());
    expect(await screen.findByText(/Waiting on your club admin$/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Email them the link' })).not.toBeInTheDocument();
  });

  it('offline, says to reconnect, offers no mailto and never reads the admin contacts', () => {
    harness.online = false;
    renderWizard();
    expect(harness.rpc).not.toHaveBeenCalledWith('get_club_admin_contacts', expect.anything());
    expect(screen.getByText(/You are offline\. Reconnect/)).toBeInTheDocument();
    expect(screen.queryByText(/Waiting on your club admin/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Email them the link' })).not.toBeInTheDocument();
  });

  it('never asks the server for a club admin', () => {
    harness.canOpenPayments = true;
    renderWizard();
    expect(harness.rpc).not.toHaveBeenCalled();
  });
});

describe('club admin contacts helpers (MYK9-2208)', () => {
  it('labels an admin with no name by email and skips rows with no email', () => {
    const contacts = parseClubAdminContacts([
      { display_name: null, email: 'kim@example.test' },
      { display_name: 'No Email', email: null },
    ]);
    expect(contacts).toEqual([{ name: null, email: 'kim@example.test' }]);
    expect(buildClubAdminEmail(contacts, 'https://x.test/p')?.names).toBe('kim@example.test');
    expect(buildClubAdminEmail([], 'https://x.test/p')).toBeNull();
  });

  it('joins three names with commas and "and"', () => {
    const email = buildClubAdminEmail(
      ['A', 'B', 'C'].map(name => ({ name, email: `${name}@e.test` })),
      'https://x.test/p'
    );
    expect(email?.names).toBe('A, B and C');
  });

  it('rejects a response that is not a list', () => {
    expect(() => parseClubAdminContacts({})).toThrow();
  });
});
