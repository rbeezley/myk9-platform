import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { StepWelcome } from '../StepWelcome';

function makeProps(overrides = {}) {
  return {
    onFinish: vi.fn(),
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
});
