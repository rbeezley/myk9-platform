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

const STATES = ['AllFeeBreakdowns', 'SomeFeeBreakdownsMissing', 'NoStripeCharges'] as const;

function renderBadge(state: (typeof STATES)[number]) {
  return render(
    <div data-testid="badge-under-test">
      <ChargeVerificationBadge state={state} />
    </div>
  );
}

describe('ChargeVerificationBadge accessible name', () => {
  it.each([
    ['AllFeeBreakdowns', 'Stripe fee breakdown for every charge'],
    ['SomeFeeBreakdownsMissing', 'Some charges have no Stripe fee breakdown'],
    ['NoStripeCharges', 'No Stripe charges'],
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
    for (const state of STATES) {
      const view = renderBadge(state);
      expect(announcedText()).not.toMatch(/verif/i);
      expect(announcedText()).not.toMatch(/against Stripe/i);
      view.unmount();
    }
  });

  it('renders EVERY state neutral — coverage is not pass/fail', () => {
    // A treasurer reads colour before text. Neutral words in a green chip still
    // say "this one passed" and leave the grey rows reading as the ones that
    // did not, which is the same claim the words were changed to stop making.
    // Asserting only that the negative chip is not destructive cannot see this;
    // the assertion has to be that NO state is coloured.
    for (const state of STATES) {
      const view = renderBadge(state);
      const chip = screen.getByTestId('badge-under-test').firstElementChild as HTMLElement;

      expect(chip.className, state).not.toMatch(/bg-success/);
      expect(chip.className, state).not.toMatch(/destructive/);
      view.unmount();
    }
  });

  it('never claims a charge is absent when only its fee breakdown is', () => {
    // Both snapshot columns land NULL for a REAL Stripe charge whenever an
    // accepted entry has no fee, and a show with no stripe_orders rows may
    // still hold money taken by check at the desk. Neither is "no charge".
    for (const state of STATES) {
      const view = renderBadge(state);
      expect(announcedText(), state).not.toMatch(/no charge record/i);
      view.unmount();
    }
  });

  it('does not put a checkmark icon in front of a label about something missing', () => {
    // lucide stamps `lucide-file-check` / `lucide-file-text` on the rendered
    // svg. The icon is aria-hidden, so this is purely a sighted-user claim —
    // and a document-with-a-tick beside "Some charges have no..." contradicts
    // the words next to it. It was correct under the old "Attested" label and
    // the rename made it wrong, which is exactly the kind of leftover a
    // vocabulary change drops.
    const view = renderBadge('SomeFeeBreakdownsMissing');
    const icon = screen.getByTestId('badge-under-test').querySelector('svg');

    expect(icon?.getAttribute('class')).toMatch(/lucide-file-text/);
    expect(icon?.getAttribute('class')).not.toMatch(/lucide-file-check/);
    view.unmount();

    // The complete state keeps the checkmark, where it is accurate.
    renderBadge('AllFeeBreakdowns');
    const completeIcon = screen.getByTestId('badge-under-test').querySelector('svg');
    expect(completeIcon?.getAttribute('class')).toMatch(/lucide-file-check/);
  });

  it('stays true when one order in a show of many lacks its snapshot', () => {
    // The aggregate degrades the WHOLE show on a single missing snapshot, so
    // the label has to be a coverage statement. A flat negative would be a
    // definite false claim about a show with fifty snapshotted orders.
    renderBadge('SomeFeeBreakdownsMissing');
    const text = announcedText();

    expect(text).toMatch(/^Some charges/);
    expect(text).not.toMatch(/^No /);
  });
});
