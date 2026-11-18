import { createDatabaseError } from '@/services/database/databaseError';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';

import { render } from '@/test/utils/testUtils';
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

const readiness = vi.hoisted(() => ({
  value: { isSuccess: true, data: false, isError: false, fetchStatus: 'idle' } as Record<
    string,
    unknown
  >,
}));
vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripePaymentReadiness: () => readiness.value,
}));
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

function renderDesk(overrides: Partial<Show> = {}, canManageShow = true) {
  return render(
    <ShowDeskPanel
      show={{ ...show, ...overrides }}
      trials={[trial]}
      classes={[]}
      entries={[]}
      canManageShow={canManageShow}
      scopeNow={new Date('2026-06-12T15:00:00.000Z')}
    />,
    { initialRoute: '/shows/show-1/show-day' }
  );
}

const WHY = "Card payment is paused. The club's bank account needs attention.";
const WHO = "Card payment is paused. A club admin needs to fix the club's bank account.";

describe('Show Desk card-payment-paused item (MYK9-2166)', () => {
  beforeEach(() => {
    readiness.value = { isSuccess: true, data: false, isError: false, fetchStatus: 'idle' };
    canOpen.value = true;
    online.value = true;
  });

  it('says why and links to the club Payments tab when she can open it', () => {
    renderDesk();
    const link = screen.getByRole('link', { name: /Card payment is paused/ });
    expect(link).toHaveTextContent(WHY);
    expect(link.getAttribute('href')).toContain('/clubs/club-1?tab=payments');
  });

  it('names a club admin and offers no link when she cannot open the tab', () => {
    canOpen.value = false;
    renderDesk();
    expect(screen.getByText(WHO)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Card payment is paused/ })).not.toBeInTheDocument();
  });

  it.each([
    ['payouts on', { isSuccess: true, data: true, isError: false, fetchStatus: 'idle' }],
    [
      'not read yet',
      { isSuccess: false, data: undefined, isError: false, fetchStatus: 'fetching' },
    ],
    [
      'read failed, stale false kept',
      { isSuccess: false, data: false, isError: true, fetchStatus: 'idle' },
    ],
    [
      'offline, stale false kept',
      { isSuccess: true, data: false, isError: false, fetchStatus: 'paused' },
    ],
  ])('shows nothing when %s', (_name, value) => {
    readiness.value = value;
    renderDesk();
    expect(screen.queryByText(/Card payment is paused/)).not.toBeInTheDocument();
  });

  it('shows nothing while the answer is being refetched, with a cached false', () => {
    readiness.value = { isSuccess: true, data: false, isError: false, fetchStatus: 'fetching' };
    renderDesk();
    expect(screen.queryByText(/Card payment is paused/)).not.toBeInTheDocument();
  });

  it('shows nothing on an offline device, with a cached false and nothing fetching', () => {
    online.value = false;
    renderDesk();
    expect(screen.queryByText(/Card payment is paused/)).not.toBeInTheDocument();
  });

  it('shows nothing on a show that is not published', () => {
    renderDesk({ status: 'draft' });
    expect(screen.queryByText(/Card payment is paused/)).not.toBeInTheDocument();
  });

  it('shows nothing to someone who cannot manage the show', () => {
    renderDesk({}, false);
    expect(screen.queryByText(/Card payment is paused/)).not.toBeInTheDocument();
  });
});
