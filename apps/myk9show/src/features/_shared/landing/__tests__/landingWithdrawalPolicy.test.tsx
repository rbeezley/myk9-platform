/**
 * MYK9-1976 part 2: every public landing style prints the show's refund and withdrawal policy,
 * signed out, in the words exhibitors read at checkout, with the service-fee sentence after
 * it. Renders the REAL pages and the REAL policy hook; only the PostgREST transport is
 * stubbed, with the row an anonymous visitor gets back.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { render } from '@/test/utils/testUtils';
import { createChainableQuery, mockSupabase } from '@/test/mocks/supabase';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { EFFECTIVE_WITHDRAWAL_SELECT } from '@/features/payments/useEffectiveWithdrawalPolicy';
import { SERVICE_FEE_SENTENCE } from '@/features/payments/withdrawalPolicyText';
import { STYLED_LANDING_BY_STYLE } from '@/features/_shared/styledLandingRegistry';
import type { PremiumStyle } from '@/types/premium-types';

interface PageProps {
  show: Show;
  trial: Trial;
  allTrials: Trial[];
}

const STYLES = Object.entries(STYLED_LANDING_BY_STYLE) as Array<
  [PremiumStyle, ComponentType<PageProps>]
>;

const show = {
  id: 'show-heartland',
  name: 'Heartland Scent Work Classic',
  organization: 'Heartland Dog Club',
} as Show;
const trial = {
  id: 'trial-1',
  showId: show.id,
  showName: show.name,
  trialDate: '2026-08-01',
  trialNumber: 'Trial 1',
  status: 'no-status',
} as unknown as Trial;

const CLUB_TEXT =
  'Entries withdrawn by June 1 are refunded in full.\nAfter June 1 the club keeps $5.\n\nPulls are not refunded.';

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    withdrawal_cutoff_date: null,
    withdrawal_retention_type: null,
    withdrawal_retention_value: null,
    withdrawal_policy_notes: null,
    withdrawal_policy_text: null,
    trials: [{ registry_id: 'AKC' }],
    clubs: {
      default_withdrawal_retention_type: null,
      default_withdrawal_retention_value: null,
      default_withdrawal_policy_notes: null,
      default_withdrawal_policy_text: CLUB_TEXT,
    },
    ...overrides,
  };
}

function answerShowsWith(response: Record<string, unknown>) {
  const query = createChainableQuery(response);
  mockSupabase.from.mockImplementation(table =>
    table === 'shows' ? query : createChainableQuery()
  );
  return query;
}

describe.each(STYLES)('%s landing refund and withdrawal policy (MYK9-1976)', (_style, Page) => {
  beforeEach(() => {
    mockViewportWidth(1280);
  });

  it('prints the club text, line breaks kept, then the service-fee sentence, signed out', async () => {
    const query = answerShowsWith({ data: policyRow(), error: null });
    render(<Page show={show} trial={trial} allTrials={[trial]} />);

    const section = await screen.findByTestId('landing-withdrawal-policy');
    // The anon read is the same one the show's About facts make.
    expect(mockSupabase.from).toHaveBeenCalledWith('shows');
    expect(query.select).toHaveBeenCalledWith(EFFECTIVE_WITHDRAWAL_SELECT);
    expect(query.eq).toHaveBeenCalledWith('id', show.id);
    expect(within(section).getByRole('heading', { name: 'Withdrawals and Pulls' })).toBeTruthy();
    // textContent keeps the newlines; the paragraph renders them (white-space: pre-line).
    const text = within(section).getByText(/Entries withdrawn by June 1/);
    expect(text.textContent).toBe(CLUB_TEXT);
    expect(getComputedStyle(text).whiteSpace).toBe('pre-line');
    expect(within(section).getByText(SERVICE_FEE_SENTENCE)).toBeTruthy();
  });

  it("prints the show's own text over the club's, whole", async () => {
    const long = `${'The show keeps a five dollar office fee. '.repeat(28)}End of policy.`.trim();
    answerShowsWith({ data: policyRow({ withdrawal_policy_text: long }), error: null });
    render(<Page show={show} trial={trial} allTrials={[trial]} />);

    const section = await screen.findByTestId('landing-withdrawal-policy');
    await waitFor(() =>
      expect(within(section).getByText(/End of policy\.$/).textContent).toBe(long)
    );
    expect(within(section).queryByText(/Entries withdrawn by June 1/)).toBeNull();
    expect(within(section).getByText(SERVICE_FEE_SENTENCE)).toBeTruthy();
  });

  it('says the policy could not be loaded when the read fails, and still prints the service-fee sentence', async () => {
    answerShowsWith({ data: null, error: { message: 'boom' } });
    render(<Page show={show} trial={trial} allTrials={[trial]} />);

    const section = await screen.findByTestId('landing-withdrawal-policy');
    expect(within(section).getByText(/could not be loaded/)).toBeTruthy();
    expect(within(section).getByText(SERVICE_FEE_SENTENCE)).toBeTruthy();
  });
});
