/**
 * MYK9-230 — the badge's claim may not outrun its resolver.
 *
 * These assert the ACCESSIBLE NAME a screen reader actually receives, computed
 * from the rendered DOM, not an `aria-label`. That distinction is the whole
 * point: `Badge` renders a role-less <div>, which maps to role="generic", and
 * naming a generic element is prohibited — so every `aria-label` these badges
 * once carried was silently dropped by the accessibility tree and asserting one
 * would prove nothing. `clubPaymentsPresentation.source.test.ts` guards against
 * re-adding them.
 */
import { render, screen } from '@testing-library/react';

import { ChargeVerificationBadge } from '../ChargeVerificationBadge';

/**
 * The text a screen reader announces for the badge: its full rendered text
 * content, `sr-only` spans included. If an `sr-only` qualifier is ever added
 * back, it lands here and the equality assertions below fail — which is the
 * regression #1723 created, where a correct accessibility fix promoted a latent
 * overclaim into a spoken one.
 */
function announcedText(): string {
  const badge = screen.getByTestId('badge-under-test').firstElementChild as HTMLElement;
  return (badge.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function renderBadge(state: 'StripeRecord' | 'NoStripeRecord' | 'Unknown') {
  return render(
    <div data-testid="badge-under-test">
      <ChargeVerificationBadge state={state} />
    </div>
  );
}

describe('ChargeVerificationBadge accessible name', () => {
  it.each([
    ['StripeRecord', 'Stripe record on file'],
    ['NoStripeRecord', 'No Stripe record on file'],
    ['Unknown', 'No charge record'],
  ] as const)('announces %s as exactly its visible text', (state, expected) => {
    renderBadge(state);

    // Visible text and announced text are the SAME string. A screen-reader user
    // and a sighted user receive an identical claim — no sr-only extension
    // saying more than the label.
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(announcedText()).toBe(expected);
  });

  it('never speaks a Stripe verification claim the resolver does not test', () => {
    // The resolver checks two snapshot columns for non-null. It does not call
    // Stripe, does not compare amounts, and cannot know whether the club was
    // paid. "Verified against Stripe" — which this badge used to announce —
    // asserted all three.
    for (const state of ['StripeRecord', 'NoStripeRecord', 'Unknown'] as const) {
      const view = renderBadge(state);
      expect(announcedText()).not.toMatch(/verif/i);
      expect(announcedText()).not.toMatch(/against Stripe/i);
      view.unmount();
    }
  });

  it('keeps "no Stripe record" neutral, never destructive', () => {
    // A desk payment or a legacy order is the NORMAL shape of this state, not a
    // problem. A treasurer scanning the list must not read an absence of a
    // Stripe row as a warning about their money.
    renderBadge('NoStripeRecord');
    const badge = screen.getByText('No Stripe record on file');

    expect(badge.className).not.toMatch(/destructive/);
    expect(badge.className).not.toMatch(/bg-success/);
  });

  it('distinguishes "no charge at all" from "a charge with no Stripe row"', () => {
    // Two different facts. Collapsing them would claim we hold a charge record
    // for a show that has none.
    const view = renderBadge('Unknown');
    expect(announcedText()).toBe('No charge record');
    view.unmount();

    renderBadge('NoStripeRecord');
    expect(announcedText()).toBe('No Stripe record on file');
  });
});
