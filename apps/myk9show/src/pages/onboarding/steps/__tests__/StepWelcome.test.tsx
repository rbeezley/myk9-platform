import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { StepWelcome } from '../StepWelcome';

function makeProps(overrides = {}) {
  return {
    onFinish: vi.fn(),
    onNavigateAway: vi.fn(),
    onBack: vi.fn(),
    isSubmitting: false,
    error: '',
    ...overrides,
  };
}

describe('StepWelcome', () => {
  it('renders the welcome screen', () => {
    render(<StepWelcome {...makeProps()} />);
    expect(screen.getByTestId('step-welcome')).toBeInTheDocument();
    expect(screen.getByText(/you're all set/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /account profile/i })).toHaveAttribute(
      'href',
      '/account?section=profile'
    );
    expect(screen.getByRole('link', { name: /account notifications/i })).toHaveAttribute(
      'href',
      '/account?section=notifications'
    );
  });

  it('calls onFinish when Browse Shows is clicked', () => {
    const onFinish = vi.fn();
    render(<StepWelcome {...makeProps({ onFinish })} />);
    fireEvent.click(screen.getByRole('button', { name: /browse shows/i }));
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it('calls onBack when Back is clicked', () => {
    const onBack = vi.fn();
    render(<StepWelcome {...makeProps({ onBack })} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('disables buttons while submitting', () => {
    render(<StepWelcome {...makeProps({ isSubmitting: true })} />);
    expect(screen.getByRole('button', { name: /finishing/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
  });

  it('shows an error when error prop is set', () => {
    render(<StepWelcome {...makeProps({ error: 'Network error' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Network error');
  });

  // MYK9-858: these links used to be plain react-router `Link`s with no
  // onClick, so clicking them navigated straight past the wizard's own
  // completion logic — leaving onboarding_completed_at unset and letting the
  // ExhibitorOnboardingChecker guard on the destination page bounce the user
  // back to /onboarding step 1.
  it('routes the Account Profile link through onNavigateAway instead of a bare navigation', () => {
    const onNavigateAway = vi.fn();
    const onFinish = vi.fn();
    render(<StepWelcome {...makeProps({ onNavigateAway, onFinish })} />);

    fireEvent.click(screen.getByRole('link', { name: /account profile/i }));

    expect(onNavigateAway).toHaveBeenCalledExactlyOnceWith('/account?section=profile');
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('routes the Account Notifications link through onNavigateAway instead of a bare navigation', () => {
    const onNavigateAway = vi.fn();
    const onFinish = vi.fn();
    render(<StepWelcome {...makeProps({ onNavigateAway, onFinish })} />);

    fireEvent.click(screen.getByRole('link', { name: /account notifications/i }));

    expect(onNavigateAway).toHaveBeenCalledExactlyOnceWith('/account?section=notifications');
    expect(onFinish).not.toHaveBeenCalled();
  });
});
