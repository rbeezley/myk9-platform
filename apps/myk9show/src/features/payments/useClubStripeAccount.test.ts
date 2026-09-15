import { describe, it, expect, vi, beforeEach } from 'vitest';

// MYK9-579: fetchClubStripeAccount / fetchClubStripePaymentReadiness now read
// platform_settings.stripe_livemode instead of the removed VITE_STRIPE_LIVEMODE
// env var. A minimal chainable mock: `.from('platform_settings')` resolves the
// livemode row, `.from('club_stripe_accounts')` resolves the account row, and
// `.rpc(...)` resolves the readiness RPC. Assertion-first per CLAUDE.md: these
// pin the EXACT livemode value forwarded to each downstream call, since a
// silently-wrong livemode is exactly the class of bug (a stale/default false
// reaching a live-mode cutover) this migration exists to prevent.
const platformSettingsMaybeSingle = vi.hoisted(() => vi.fn());
const clubStripeAccountsMaybeSingle = vi.hoisted(() => vi.fn());
const clubStripeAccountsEq = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());

function makePlatformSettingsQuery() {
  // fetchStripeLivemode selects, then `.limit(1)` (a singleton row, not a
  // filter column -- see useClubStripeAccount.ts's own comment on why this
  // is no longer `.eq('id', true)`), then `.maybeSingle()`.
  return { select: () => ({ limit: () => ({ maybeSingle: platformSettingsMaybeSingle }) }) };
}

function makeClubStripeAccountsQuery() {
  return {
    select: () => ({
      eq: (column: string, value: unknown) => {
        clubStripeAccountsEq(column, value);
        return {
          eq: (column2: string, value2: unknown) => {
            clubStripeAccountsEq(column2, value2);
            return { maybeSingle: clubStripeAccountsMaybeSingle };
          },
        };
      },
    }),
  };
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) =>
      table === 'platform_settings' ? makePlatformSettingsQuery() : makeClubStripeAccountsQuery(),
    rpc,
  },
}));

vi.mock('@/lib/queryClient', () => ({
  cacheStrategies: { moderate: {} },
}));

const useQueryMock = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-query', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQuery: useQueryMock };
});

import {
  mapConnectOnboardingError,
  fetchClubStripeAccount,
  fetchClubStripePaymentReadiness,
  useClubStripeAccount,
  useClubStripePaymentReadiness,
} from './useClubStripeAccount';

const FALLBACK = "We couldn't start your payment setup. Please try again in a moment.";

describe('mapConnectOnboardingError', () => {
  it('falls back to friendly generic copy for unknown/technical strings', () => {
    expect(mapConnectOnboardingError('Edge Function returned a non-2xx status code')).toBe(
      FALLBACK
    );
    expect(mapConnectOnboardingError('Failed to save payment account')).toBe(FALLBACK);
    expect(mapConnectOnboardingError('Some brand new Stripe error nobody mapped')).toBe(FALLBACK);
  });

  it('falls back to generic copy for empty / nullish input', () => {
    expect(mapConnectOnboardingError(undefined)).toBe(FALLBACK);
    expect(mapConnectOnboardingError(null)).toBe(FALLBACK);
    expect(mapConnectOnboardingError('')).toBe(FALLBACK);
  });

  it('never returns a raw Stripe capability string verbatim', () => {
    // The motivating bug: this exact technical string used to render in a
    // destructive Alert to an anxious treasurer.
    const raw = 'account capability transfers is inactive';
    const mapped = mapConnectOnboardingError(raw);
    expect(mapped).not.toBe(raw);
    expect(mapped).not.toMatch(/capability/i);
    expect(mapped).toMatch(/Stripe is still verifying/i);
  });

  it('maps expired-session errors to a sign-in next step', () => {
    expect(mapConnectOnboardingError('Authentication failed')).toMatch(/sign in again/i);
    expect(mapConnectOnboardingError('Missing Authorization header')).toMatch(/sign in again/i);
  });

  it('maps a real permission denial (403) to an ask-an-admin next step', () => {
    expect(mapConnectOnboardingError('Not authorized for this club')).toMatch(
      /club administrator/i
    );
  });

  it('maps an RBAC RPC failure (500) to a retry/support message, NOT ask-an-admin', () => {
    // "Authorization check failed" means the is_club_admin RPC itself errored,
    // not that the caller lacks access — an admin must not be told to go get
    // permission they already have.
    const mapped = mapConnectOnboardingError('Authorization check failed');
    expect(mapped).not.toMatch(/club administrator/i);
    expect(mapped).toMatch(/try again|contact support/i);
  });

  it('maps network/provider reachability errors to a connection retry message', () => {
    expect(mapConnectOnboardingError('Failed to send a request to the Edge Function')).toMatch(
      /reach our payment provider/i
    );
    expect(mapConnectOnboardingError('Stripe rate limit exceeded')).toMatch(
      /reach our payment provider/i
    );
  });

  it('prefers the specific match when patterns could overlap (order matters)', () => {
    // Contains both "authorization" wording and would otherwise be ambiguous;
    // the auth-session matcher is listed first and must win.
    expect(mapConnectOnboardingError('Authentication failed')).not.toMatch(/club administrator/i);
  });
});

describe('fetchClubStripeAccount', () => {
  beforeEach(() => {
    platformSettingsMaybeSingle.mockReset();
    clubStripeAccountsMaybeSingle.mockReset();
    clubStripeAccountsEq.mockReset();
  });

  it('reads platform_settings.stripe_livemode and filters the account row by it', async () => {
    platformSettingsMaybeSingle.mockResolvedValue({ data: { stripe_livemode: true }, error: null });
    clubStripeAccountsMaybeSingle.mockResolvedValue({
      data: {
        id: 'csa-1',
        club_id: 'club-1',
        stripe_account_id: 'acct_live',
        livemode: true,
        onboarding_complete: true,
        payouts_enabled: true,
      },
      error: null,
    });

    const account = await fetchClubStripeAccount('club-1');
    expect(account?.livemode).toBe(true);
    expect(clubStripeAccountsEq).toHaveBeenCalledWith('club_id', 'club-1');
    expect(clubStripeAccountsEq).toHaveBeenCalledWith('livemode', true);
  });

  it('throws instead of defaulting to test mode when the platform_settings row cannot be read', async () => {
    // platform_settings is a guaranteed singleton row (20260615180000); a
    // null read here means the row could not be read, never "no row yet".
    // Silently defaulting to false risked routing a live platform through
    // the test-mode gate/account lookup (MYK9-579 round-3 review, P3-I).
    platformSettingsMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(fetchClubStripeAccount('club-1')).rejects.toThrow(
      'Could not read platform_settings.stripe_livemode.'
    );
    expect(clubStripeAccountsMaybeSingle).not.toHaveBeenCalled();
  });

  it('propagates an error reading platform_settings instead of silently defaulting', async () => {
    const error = { code: '42501', message: 'not authorized' };
    platformSettingsMaybeSingle.mockResolvedValue({ data: null, error });

    await expect(fetchClubStripeAccount('club-1')).rejects.toBe(error);
    expect(clubStripeAccountsMaybeSingle).not.toHaveBeenCalled();
  });
});

describe('fetchClubStripePaymentReadiness', () => {
  beforeEach(() => {
    platformSettingsMaybeSingle.mockReset();
    rpc.mockReset();
  });

  it('forwards the live platform_settings.stripe_livemode value to the RPC, never the DEFAULT false', async () => {
    platformSettingsMaybeSingle.mockResolvedValue({ data: { stripe_livemode: true }, error: null });
    rpc.mockResolvedValue({ data: true, error: null });

    await fetchClubStripePaymentReadiness('club-1');

    expect(rpc).toHaveBeenCalledWith('can_accept_online_entry_payment', {
      p_club_id: 'club-1',
      p_livemode: true,
    });
  });

  it('forwards false when the settings row reads test mode', async () => {
    platformSettingsMaybeSingle.mockResolvedValue({
      data: { stripe_livemode: false },
      error: null,
    });
    rpc.mockResolvedValue({ data: true, error: null });

    await fetchClubStripePaymentReadiness('club-1');

    expect(rpc).toHaveBeenCalledWith('can_accept_online_entry_payment', {
      p_club_id: 'club-1',
      p_livemode: false,
    });
  });
});

describe('useClubStripeAccount / useClubStripePaymentReadiness queryFn (P3-G)', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    platformSettingsMaybeSingle.mockReset();
    clubStripeAccountsMaybeSingle.mockReset();
    clubStripeAccountsEq.mockReset();
    rpc.mockReset();
  });

  it('skips re-reading platform_settings once useStripeLivemode has already resolved it', async () => {
    // First useQuery call inside the hook is useStripeLivemode's own; give it
    // a resolved value so the account query's queryFn can use it directly.
    useQueryMock.mockReturnValueOnce({ data: true, isLoading: false, isError: false });
    useQueryMock.mockReturnValueOnce({ data: undefined, isLoading: true, isError: false });

    useClubStripeAccount('club-1');

    const accountQueryConfig = useQueryMock.mock.calls[1]?.[0] as
      { queryFn?: () => Promise<unknown> } | undefined;
    clubStripeAccountsMaybeSingle.mockResolvedValue({
      data: {
        id: 'csa-1',
        club_id: 'club-1',
        stripe_account_id: 'acct_live',
        livemode: true,
        onboarding_complete: true,
        payouts_enabled: true,
      },
      error: null,
    });

    await accountQueryConfig?.queryFn?.();

    // The account row is filtered by the ALREADY-resolved livemode, and
    // platform_settings is never touched by this queryFn call.
    expect(clubStripeAccountsEq).toHaveBeenCalledWith('livemode', true);
    expect(platformSettingsMaybeSingle).not.toHaveBeenCalled();
  });

  it('falls back to reading platform_settings itself on the very first cold mount', async () => {
    useQueryMock.mockReturnValueOnce({ data: undefined, isLoading: true, isError: false });
    useQueryMock.mockReturnValueOnce({ data: undefined, isLoading: true, isError: false });

    useClubStripeAccount('club-1');

    const accountQueryConfig = useQueryMock.mock.calls[1]?.[0] as
      { queryFn?: () => Promise<unknown> } | undefined;
    platformSettingsMaybeSingle.mockResolvedValue({
      data: { stripe_livemode: false },
      error: null,
    });
    clubStripeAccountsMaybeSingle.mockResolvedValue({
      data: {
        id: 'csa-1',
        club_id: 'club-1',
        stripe_account_id: 'acct_test',
        livemode: false,
        onboarding_complete: true,
        payouts_enabled: true,
      },
      error: null,
    });

    await accountQueryConfig?.queryFn?.();

    expect(platformSettingsMaybeSingle).toHaveBeenCalledTimes(1);
    expect(clubStripeAccountsEq).toHaveBeenCalledWith('livemode', false);
  });

  it('forwards an already-resolved livemode straight to the readiness RPC without a platform_settings read', async () => {
    useQueryMock.mockReturnValueOnce({ data: true, isLoading: false, isError: false });
    useQueryMock.mockReturnValueOnce({ data: undefined, isLoading: true, isError: false });

    useClubStripePaymentReadiness('club-1');

    const readinessQueryConfig = useQueryMock.mock.calls[1]?.[0] as
      { queryFn?: () => Promise<unknown> } | undefined;
    rpc.mockResolvedValue({ data: true, error: null });

    await readinessQueryConfig?.queryFn?.();

    expect(rpc).toHaveBeenCalledWith('can_accept_online_entry_payment', {
      p_club_id: 'club-1',
      p_livemode: true,
    });
    expect(platformSettingsMaybeSingle).not.toHaveBeenCalled();
  });
});
