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
const rpc = vi.hoisted(() => vi.fn());

function makePlatformSettingsQuery() {
  return { select: () => ({ eq: () => ({ maybeSingle: platformSettingsMaybeSingle }) }) };
}

function makeClubStripeAccountsQuery() {
  return {
    select: () => ({
      eq: () => ({ eq: () => ({ maybeSingle: clubStripeAccountsMaybeSingle }) }),
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

import {
  mapConnectOnboardingError,
  fetchClubStripeAccount,
  fetchClubStripePaymentReadiness,
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
  });

  it('defaults to test mode (false) when the platform_settings row has no usable value', async () => {
    platformSettingsMaybeSingle.mockResolvedValue({ data: null, error: null });
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

    const account = await fetchClubStripeAccount('club-1');
    expect(account?.livemode).toBe(false);
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
    platformSettingsMaybeSingle.mockResolvedValue({ data: { stripe_livemode: false }, error: null });
    rpc.mockResolvedValue({ data: true, error: null });

    await fetchClubStripePaymentReadiness('club-1');

    expect(rpc).toHaveBeenCalledWith('can_accept_online_entry_payment', {
      p_club_id: 'club-1',
      p_livemode: false,
    });
  });
});
