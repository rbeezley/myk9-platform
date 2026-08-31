import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import WizardNavigation from '@/components/shows/wizard/components/WizardNavigation';

const defaultProps = {
  currentStep: 1,
  totalSteps: 4,
  canGoBack: true,
  canGoNext: true,
  onBack: vi.fn(),
  onNext: vi.fn(),
};

describe('WizardNavigation', () => {
  it('renders next and back buttons', () => {
    render(<WizardNavigation {...defaultProps} />);
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  // The step counter lives in HorizontalProgressIndicator, which both consumers
  // of this component also render. It used to be printed here as well, and once
  // more by the page, so "Step N of M" appeared three times on one screen.
  // currentStep/totalSteps still drive behaviour — the Cancel-vs-Back label and
  // isLastStep — they just no longer render a duplicate counter.
  it('does not duplicate the step counter owned by the progress indicator', () => {
    render(<WizardNavigation {...defaultProps} currentStep={2} totalSteps={5} />);
    expect(screen.queryByText('Step 3 of 5')).not.toBeInTheDocument();
  });

  it("still labels the first step's back action as Cancel", () => {
    render(<WizardNavigation {...defaultProps} currentStep={0} totalSteps={5} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('uses custom labels when provided', () => {
    render(<WizardNavigation {...defaultProps} nextLabel="Submit Payment" backLabel="Cancel" />);
    expect(screen.getByText('Submit Payment')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  describe('isLoading behavior', () => {
    it('shows Processing text and spinner when isLoading is true', () => {
      render(<WizardNavigation {...defaultProps} isLoading={true} />);
      expect(screen.getByText('Processing...')).toBeInTheDocument();
      // "Next" label should not be visible
      expect(screen.queryByText('Next')).not.toBeInTheDocument();
    });

    it('disables next button when isLoading is true', () => {
      render(<WizardNavigation {...defaultProps} isLoading={true} />);
      const processingButton = screen.getByText('Processing...').closest('button');
      expect(processingButton).toBeDisabled();
    });

    it('disables back button when isLoading is true', () => {
      render(<WizardNavigation {...defaultProps} isLoading={true} />);
      const backButton = screen.getByText('Back').closest('button');
      expect(backButton).toBeDisabled();
    });

    it('does not call onNext when clicked while loading', async () => {
      const onNext = vi.fn();
      const { user } = render(
        <WizardNavigation {...defaultProps} onNext={onNext} isLoading={true} />
      );
      const processingButton = screen.getByText('Processing...').closest('button')!;
      await user.click(processingButton);
      expect(onNext).not.toHaveBeenCalled();
    });

    it('shows normal next label when isLoading is false', () => {
      render(<WizardNavigation {...defaultProps} isLoading={false} />);
      expect(screen.getByText('Next')).toBeInTheDocument();
      expect(screen.queryByText('Processing...')).not.toBeInTheDocument();
    });

    it('enables buttons when isLoading is false and navigation is allowed', () => {
      render(<WizardNavigation {...defaultProps} isLoading={false} />);
      const nextButton = screen.getByText('Next').closest('button');
      const backButton = screen.getByText('Back').closest('button');
      expect(nextButton).not.toBeDisabled();
      expect(backButton).not.toBeDisabled();
    });
  });

  describe('canGoNext / canGoBack', () => {
    it('disables next button when canGoNext is false', () => {
      render(<WizardNavigation {...defaultProps} canGoNext={false} />);
      const nextButton = screen.getByText('Next').closest('button');
      expect(nextButton).toBeDisabled();
    });

    it('disables back button when canGoBack is false', () => {
      render(<WizardNavigation {...defaultProps} canGoBack={false} />);
      const backButton = screen.getByText('Back').closest('button');
      expect(backButton).toBeDisabled();
    });
  });

  // The blocked Next has now shipped wrong twice with no test to catch it:
  // first as a fully-enabled-looking button that silently ate clicks, then as
  // one whose dim evaporated on hover because the variant's own hover:opacity-90
  // outranked it. It is aria-disabled rather than disabled ON PURPOSE, so its
  // reason stays reachable to a keyboard user — which is exactly why it needs
  // its own assertions.
  describe('blockedReasonId (aria-disabled Next)', () => {
    const blocked = { canGoNext: false, blockedReasonId: 'why-blocked' };

    it('stays focusable so its reason can be read on demand', () => {
      render(<WizardNavigation {...defaultProps} {...blocked} />);
      const next = screen.getByRole('button', { name: 'Next' });
      expect(next).not.toBeDisabled();
      expect(next).toHaveAttribute('aria-disabled', 'true');
      expect(next).toHaveAttribute('aria-describedby', 'why-blocked');
    });

    it('does nothing when clicked while blocked', async () => {
      const onNext = vi.fn();
      const { user } = render(<WizardNavigation {...defaultProps} {...blocked} onNext={onNext} />);
      await user.click(screen.getByRole('button', { name: 'Next' }));
      expect(onNext).not.toHaveBeenCalled();
    });

    it('carries a blocked appearance that hover cannot undo', () => {
      render(<WizardNavigation {...defaultProps} {...blocked} />);
      const classes = screen.getByRole('button', { name: 'Next' }).className.split(/\s+/);
      const cls = classes.join(' ');
      // Token pair, not an opacity dim: this control is focusable, so it still
      // has to meet AA. opacity-50 measured 2.22:1 light / 2.42:1 dark.
      expect(cls).toContain('bg-muted');
      // Exact token, not a substring: the variant ships `disabled:opacity-50`,
      // which a toContain check would match and pass on.
      expect(classes).not.toContain('opacity-50');
      // The variant ships hover:opacity-90 and a hover lift; both must be
      // neutralised or the "disabled" look disappears under the pointer.
      expect(cls).toContain('hover:opacity-100');
      expect(cls).toContain('hover:translate-y-0');
    });

    it('behaves like a normal disabled button when no reason id is given', () => {
      render(<WizardNavigation {...defaultProps} canGoNext={false} />);
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    });
  });

  describe('remainingIssueCount hint', () => {
    it('renders a pluralized hint when issues remain', () => {
      render(<WizardNavigation {...defaultProps} remainingIssueCount={3} />);
      expect(screen.getByText('3 items remaining')).toBeInTheDocument();
    });

    it('renders a singular hint when exactly one issue remains', () => {
      render(<WizardNavigation {...defaultProps} remainingIssueCount={1} />);
      expect(screen.getByText('1 item remaining')).toBeInTheDocument();
    });

    it('renders no hint when no issues remain', () => {
      render(<WizardNavigation {...defaultProps} remainingIssueCount={0} />);
      expect(screen.queryByText(/remaining/i)).not.toBeInTheDocument();
    });

    it('renders no hint when the prop is omitted', () => {
      render(<WizardNavigation {...defaultProps} />);
      expect(screen.queryByText(/remaining/i)).not.toBeInTheDocument();
    });

    it('hides the hint while loading', () => {
      render(<WizardNavigation {...defaultProps} isLoading={true} remainingIssueCount={3} />);
      expect(screen.queryByText(/remaining/i)).not.toBeInTheDocument();
    });

    it('keeps Next clickable while issues remain (feedback, not a dead-end)', () => {
      // The page passes canGoNext independent of validation so the click can
      // surface the validation banner instead of the button sitting disabled.
      const onNext = vi.fn();
      render(
        <WizardNavigation
          {...defaultProps}
          canGoNext={true}
          remainingIssueCount={3}
          onNext={onNext}
        />
      );
      const nextButton = screen.getByText('Next').closest('button');
      expect(nextButton).not.toBeDisabled();
    });
  });
});
