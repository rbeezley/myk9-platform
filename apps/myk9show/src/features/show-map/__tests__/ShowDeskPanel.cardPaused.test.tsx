import { createDatabaseError } from '@/services/database/databaseError';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';

import { createTestQueryClient, render } from '@/test/utils/testUtils';
import { readinessKey, readinessServer } from '@/features/payments/__tests__/fakeReadiness';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { Show } from '@/types/show-types';

import ShowDeskPanel from '../ShowDeskPanel';

// The Requirements row reads the class replica; these tests do not exercise it.
// The card hook also reads the printed-sheet rows (MYK9-2103); not under test here.
vi.mock('@/hooks/queries/usePrintedSheetEntries', () => ({
  usePrintedSheetEntries: () => ({ data: undefined }),
}));
vi.mock('@/features/at-show/useLiveClasses', () => ({ useLiveClasses: () => null }));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
  createDatabaseError,
}));
vi.mock('@/services/database/day-of-operations', () => ({}));
vi.mock('@/services/database/entries/lifecycle', () => ({}));
vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(() => () => undefined),
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { updateClass: vi.fn(), subscribe: vi.fn(() => () => undefined) },
  replicatedPaperworkPrintsTable: {
    subscribe: vi.fn(() => () => undefined),
    sync: vi.fn(async () => ({ success: true })),
    getByShow: vi.fn(async () => []),
    voidPrint: vi.fn(async () => undefined),
  },
}));
vi.mock('@/store/messageStore', () => ({
  useMessageStore: (
    selector: (state: {
      getOrCreateThread: ReturnType<typeof vi.fn>;
      sendMessage: ReturnType<typeof vi.fn>;
    }) => unknown
  ) => selector({ getOrCreateThread: vi.fn(), sendMessage: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// jsdom has no layout: the cockpit splits on its own measured width (cockpitSplit.ts), so a test
// sets the width it would measure. Null (unmeasured) is the stacked layout.
const cockpitWidth = vi.hoisted(() => ({ value: null as number | null }));
vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: { current: null }, width: cockpitWidth.value }),
}));

vi.mock('@/features/payments/useClubStripeAccount', async () => {
  const fake = await import('@/features/payments/__tests__/fakeReadiness');
  return { useClubStripePaymentReadiness: fake.fakeUseClubStripePaymentReadiness };
});
const online = vi.hoisted(() => ({ value: true }));
vi.mock('@/hooks/guestServerRead', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/guestServerRead')>()),
  useQueryOnlineStatus: () => online.value,
}));
const canOpen = vi.hoisted(() => ({ value: true }));
vi.mock('@/features/payments/useCanOpenClubPayments', () => ({
  useCanOpenClubPayments: () => canOpen.value,
  clubPaymentsHref: (clubId: string) => `/clubs/${clubId}?tab=payments`,
}));

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubId: 'club-1',
  clubName: 'Calm Canine Club',
  organization: 'AKC',
  startDate: '2026-06-12',
  endDate: '2026-06-14',
  status: 'published',
} as Show;

const trial = fromAny<SyncableTrial, unknown>({
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  name: 'Friday AM',
  trialDate: '2026-06-12',
  trialNumber: 'Friday AM',
  timezone: 'America/New_York',
  order: '1',
  status: 'In Progress',
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
});

function renderDesk(
  overrides: Partial<Show> = {},
  canManageShow = true,
  cached: boolean | undefined = true
) {
  const queryClient = createTestQueryClient();
  if (cached !== undefined) queryClient.setQueryData(readinessKey('club-1'), cached);
  return render(
    <ShowDeskPanel
      show={{ ...show, ...overrides }}
      trials={[trial]}
      classes={[]}
      entries={[]}
      canManageShow={canManageShow}
      scopeNow={new Date('2026-06-12T15:00:00.000Z')}
    />,
    { initialRoute: '/shows/show-1/show-day', queryClient }
  );
}

const WHY = "Card payment is paused. The club's bank account needs attention.";
const WHO = "Card payment is paused. A club admin needs to fix the club's bank account.";
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('Show Desk card-payment-paused item (MYK9-2166)', () => {
  beforeEach(() => {
    readinessServer.mockReset();
    readinessServer.mockResolvedValue(false);
    canOpen.value = true;
    online.value = true;
  });

  it('says why and links to the club Payments tab when she can open it', async () => {
    renderDesk();
    const link = await screen.findByRole('link', { name: /Card payment is paused/ });
    expect(link).toHaveTextContent(WHY);
    expect(link.getAttribute('href')).toContain('/clubs/club-1?tab=payments');
  });

  it('names a club admin and offers no link when she cannot open the tab', async () => {
    canOpen.value = false;
    renderDesk();
    expect(await screen.findByText(WHO)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Card payment is paused/ })).not.toBeInTheDocument();
  });

  it('warm cache true, server now false: nothing at first, the item after the recheck', async () => {
    renderDesk({}, true, true);
    expect(screen.queryByText(/Card payment is paused/)).not.toBeInTheDocument();
    expect(await screen.findByText(WHY)).toBeInTheDocument();
    expect(readinessServer).toHaveBeenCalledTimes(1);
  });

  it('warm cache false, server now true: the item never appears', async () => {
    readinessServer.mockResolvedValue(true);
    renderDesk({}, true, false);
    expect(screen.queryByText(/Card payment is paused/)).not.toBeInTheDocument();
    await waitFor(() => expect(readinessServer).toHaveBeenCalledTimes(1));
    await settle();
    expect(screen.queryByText(/Card payment is paused/)).not.toBeInTheDocument();
  });

  it('shows nothing when the recheck fails, even with a warm false', async () => {
    readinessServer.mockRejectedValue(new Error('network'));
    renderDesk({}, true, false);
    await waitFor(() => expect(readinessServer).toHaveBeenCalledTimes(1));
    await settle();
    expect(screen.queryByText(/Card payment is paused/)).not.toBeInTheDocument();
  });

  it('shows nothing on an offline device, with a warm false', async () => {
    online.value = false;
    renderDesk();
    await settle();
    expect(readinessServer).not.toHaveBeenCalled();
    expect(screen.queryByText(/Card payment is paused/)).not.toBeInTheDocument();
  });

  it('shows nothing on a show that is not published', async () => {
    renderDesk({ status: 'draft' });
    await waitFor(() => expect(readinessServer).toHaveBeenCalledTimes(1));
    await settle();
    expect(screen.queryByText(/Card payment is paused/)).not.toBeInTheDocument();
  });

  it('shows nothing to someone who cannot manage the show, and does not recheck', async () => {
    renderDesk({}, false);
    await settle();
    expect(readinessServer).not.toHaveBeenCalled();
    expect(screen.queryByText(/Card payment is paused/)).not.toBeInTheDocument();
  });
});
