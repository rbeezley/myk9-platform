import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { StepNotifications } from '../StepNotifications';
import type { NotificationPrefs } from '../StepNotifications';

const defaultPrefs: NotificationPrefs = {
  emailResults: true,
  emailReminders: true,
  pushResults: false,
  pushReminders: false,
};

function makeProps(overrides = {}) {
  return {
    data: defaultPrefs,
    onChange: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    onSkip: vi.fn(),
    ...overrides,
  };
}

describe('StepNotifications', () => {
  it('renders the notification form', () => {
    render(<StepNotifications {...makeProps()} />);
    expect(screen.getByTestId('step-notifications')).toBeInTheDocument();
    // Two "Results published" labels exist (email + push) — query by id to avoid ambiguity
    expect(
      screen.getByLabelText('Results published', { selector: '#pref-email-results' })
    ).toBeInTheDocument();
  });

  it('reflects checked state from props', () => {
    render(<StepNotifications {...makeProps()} />);
    const emailResults = screen.getByLabelText('Results published', {
      selector: '#pref-email-results',
    });
    expect(emailResults).toBeChecked();
    const pushResults = screen.getByLabelText('Results published', {
      selector: '#pref-push-results',
    });
    expect(pushResults).not.toBeChecked();
  });

  it('calls onChange when a checkbox is toggled', () => {
    const onChange = vi.fn();
    render(<StepNotifications {...makeProps({ onChange })} />);
    fireEvent.click(screen.getByLabelText('Results published', { selector: '#pref-push-results' }));
    expect(onChange).toHaveBeenCalledWith({ ...defaultPrefs, pushResults: true });
  });

  it('calls onSkip when skip is clicked', () => {
    const onSkip = vi.fn();
    render(<StepNotifications {...makeProps({ onSkip })} />);
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('calls onBack when back is clicked', () => {
    const onBack = vi.fn();
    render(<StepNotifications {...makeProps({ onBack })} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('calls onNext on form submit', () => {
    const onNext = vi.fn();
    render(<StepNotifications {...makeProps({ onNext })} />);
    fireEvent.submit(screen.getByTestId('step-notifications'));
    expect(onNext).toHaveBeenCalledOnce();
  });
});
