/**
 * MYK9-229 — the signed-out path on /fees must render the LIVE rate.
 *
 * This is the single most important assertion in the anon-read change, and it
 * is easy to write vacuously: the compiled-in fallback is 7% / 0¢ / 0¢, which
 * is exactly what `platform_settings` holds today, so a test at those numbers
 * passes identically whether the row was read or the fallback was used. Every
 * rate below therefore DIFFERS from the fallback.
 *
 * Unlike the sibling FeesPage.test.tsx this file does NOT mock the fee hook —
 * it mocks the supabase client underneath it, so the real query (the one anon's
 * column grant has to satisfy) runs, and its column list is asserted. The
 * database half of the guarantee — the column GRANT and the anon RLS policy —
 * is pinned by src/test/database/platformSettingsAnonFeeReadContract.test.ts.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { calculatePlatformFeeCents } from '@/store/cartStore.helpers';

const h = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  limit: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: h.select }),
    // Signed OUT: no session, which is the whole scenario. AuthProvider reads
    // this on mount, and getSession() is a local read that works offline — the
    // visitor is unauthenticated, not disconnected.
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
      subscribe: () => ({ unsubscribe: () => {} }),
    }),
    removeChannel: () => {},
  },
}));

import FeesPage from '../FeesPage';

beforeEach(() => {
  vi.clearAllMocks();
  h.limit.mockImplementation(() => ({ maybeSingle: h.maybeSingle }));
  h.eq.mockImplementation(() => ({ maybeSingle: h.maybeSingle, limit: h.limit }));
  h.select.mockImplementation(() => ({ limit: h.limit, eq: h.eq }));
});

/** The example-table row for a given entry subtotal. */
function rowFor(dollars: string) {
  return screen.getByRole('row', { name: new RegExp(`^\\$${dollars}\\s`) });
}

describe('FeesPage — signed out', () => {
  it('publishes the rate it READ, not the compiled-in fallback', async () => {
    // Deliberately unlike the 7 / 0 / 0 fallback in every component.
    h.maybeSingle.mockResolvedValue({
      data: {
        platform_fee_percent: '9.50',
        platform_fee_flat_cents: 25,
        platform_fee_min_cents: 0,
      },
      error: null,
    });

    render(<FeesPage />);

    const liveRates = { percent: 9.5, flatCents: 25, minCents: 0 };
    const charged = calculatePlatformFeeCents(2500, liveRates);
    expect(charged).toBe(263);

    await waitFor(() => {
      expect(screen.getByText(/9\.5% \+ \$0\.25 on top/i)).toBeInTheDocument();
    });
    const cells = within(rowFor('25\\.00')).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('$2.63');

    // The fallback's answer for the same cart. Its absence is the whole point.
    expect(document.body.textContent).not.toContain('$1.75');
    expect(document.body.textContent).not.toMatch(/\b7% on top/);
  });

  it('asks only for the three columns anon is granted, and filters on none', async () => {
    h.maybeSingle.mockResolvedValue({
      data: {
        platform_fee_percent: 9.5,
        platform_fee_flat_cents: 0,
        platform_fee_min_cents: 0,
      },
      error: null,
    });

    render(<FeesPage />);
    await waitFor(() => expect(screen.getByText(/9\.5% on top/i)).toBeInTheDocument());

    const requested = (h.select.mock.calls[0][0] as string).split(',').map(c => c.trim());
    expect(requested.sort()).toEqual([
      'platform_fee_flat_cents',
      'platform_fee_min_cents',
      'platform_fee_percent',
    ]);
    // A filter on `id` would need SELECT on `id`, which anon does not hold —
    // PostgREST answers 403 with an empty body, which React Query then presents
    // as an offline hang rather than a permissions failure.
    expect(h.eq).not.toHaveBeenCalled();
  });

  it('admits it does not know rather than falling back when the read fails', async () => {
    // This is the state a MISSING grant or a MISSING policy actually produces.
    h.maybeSingle.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    render(<FeesPage />);

    await waitFor(() => {
      expect(screen.getByText(/could not load the current service fee/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('$1.75');
  });
});
