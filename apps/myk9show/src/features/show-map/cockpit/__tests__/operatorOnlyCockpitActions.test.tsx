import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CockpitActionLink } from '../CockpitActionLink';
import { TrialSecretaryAccessProvider } from '@/features/actions/TrialSecretaryAccessContext';
import { TRIAL_SECRETARY_ONLY_REASON } from '@/features/actions/trialSecretaryAccess';
import { EntryManagementUnresolvedShow } from '@/pages/secretary/EntryManagementUnresolvedShow';

/**
 * REV-2341 U-2. The control half of the R-1 fix — `operatorOnly` on the
 * paper-scoring action, the provider, and `CockpitActionLink`'s disabled branch
 * — shipped with NO test: deleting `operatorOnly: true` from the snapshot left
 * 394 tests green, and blanking the provider's reason left 274 green. That is
 * R-4's exact failure mode, in the code written to answer R-4.
 */
function renderAction(
  action: {
    id: string;
    label: string;
    destination: { kind: 'href'; href: string };
    operatorOnly?: boolean;
  },
  reason: string | undefined
) {
  return render(
    <MemoryRouter>
      <TrialSecretaryAccessProvider reason={reason}>
        <CockpitActionLink
          destination={action.destination}
          onCommand={() => {}}
          operatorOnly={action.operatorOnly === true}
        >
          {action.label}
        </CockpitActionLink>
      </TrialSecretaryAccessProvider>
    </MemoryRouter>
  );
}

/**
 * The two shapes the cockpit passes this component. Which ACTION carries
 * `operatorOnly` is asserted against the real builder in
 * `buildSecretaryCockpitSnapshot.test.ts`; this file is about what the link
 * does with the flag.
 */
const PAPER_SCORES = {
  id: 'paper-scoring:class-1',
  label: 'Enter paper scores',
  destination: { kind: 'href', href: '/scoring/classes/class-1/entries?mode=split' } as const,
  operatorOnly: true,
};
const CLASS_DETAILS = {
  id: 'class-details:class-1',
  label: 'View entries and results',
  destination: { kind: 'href', href: '/shows/show-1/classes/class-1' } as const,
};

describe('operator-only cockpit actions', () => {
  it('greys it for a manager who is not an operator, with no anchor to /scoring', () => {
    renderAction(PAPER_SCORES, TRIAL_SECRETARY_ONLY_REASON);

    expect(screen.getByRole('button', { name: /enter paper scores/i })).toBeDisabled();
    expect(screen.getByText(TRIAL_SECRETARY_ONLY_REASON)).toBeInTheDocument();
    // The dead end this exists to prevent: no link into the secretary-only route.
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelector('a[href^="/scoring/"]')).toBeNull();
  });

  it('describes the disabled button by an id derived from its own destination', () => {
    renderAction(PAPER_SCORES, TRIAL_SECRETARY_ONLY_REASON);

    const describedBy = screen
      .getByRole('button', { name: /enter paper scores/i })
      .getAttribute('aria-describedby');
    expect(describedBy).toContain('/scoring/');
    expect(document.getElementById(describedBy ?? '')).toHaveTextContent(
      TRIAL_SECRETARY_ONLY_REASON
    );
  });

  it('positive control: with no reason it is a live link again', () => {
    renderAction(PAPER_SCORES, undefined);

    const link = screen.getByRole('link', { name: /enter paper scores/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('/scoring/'));
    expect(screen.queryByText(TRIAL_SECRETARY_ONLY_REASON)).toBeNull();
  });

  it('negative control: a class-work action that is NOT operator-only stays a link under the same reason', () => {
    renderAction(CLASS_DETAILS, TRIAL_SECRETARY_ONLY_REASON);

    expect(screen.getByRole('link')).toBeInTheDocument();
    expect(screen.queryByText(TRIAL_SECRETARY_ONLY_REASON)).toBeNull();
  });
});

describe('EntryManagementUnresolvedShow tells the transient state from the refusal', () => {
  const base = { didResolveShow: true, showError: null, onRetry: () => {} };

  function renderUnresolved(secretaryOnlyReason: string | undefined) {
    return render(
      <MemoryRouter>
        <EntryManagementUnresolvedShow
          {...base}
          {...(secretaryOnlyReason === undefined ? {} : { secretaryOnlyReason })}
        />
      </MemoryRouter>
    );
  }

  it('sends a refused club admin to /shows', () => {
    renderUnresolved(TRIAL_SECRETARY_ONLY_REASON);
    expect(screen.getByRole('link', { name: /go to your shows/i })).toHaveAttribute(
      'href',
      '/shows'
    );
  });

  it('sends a secretary to /secretary/dashboard', () => {
    renderUnresolved(undefined);
    expect(screen.getByRole('link', { name: /go to your shows/i })).toHaveAttribute(
      'href',
      '/secretary/dashboard'
    );
  });

  it('keeps /secretary/dashboard while access is still being checked (REV-2341 U-3)', () => {
    // "Checking your access to this show…" is not a refusal. Reading any
    // non-undefined string as one sent a REAL trial secretary to the public
    // browse page for the length of a cold load.
    renderUnresolved('Checking your access to this show…');
    expect(screen.getByRole('link', { name: /go to your shows/i })).toHaveAttribute(
      'href',
      '/secretary/dashboard'
    );
  });
});
