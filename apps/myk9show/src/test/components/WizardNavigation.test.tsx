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

  it('still labels the first step\'s back action as Cancel', () => {
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
