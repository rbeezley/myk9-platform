import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { StepProfile } from '../StepProfile';
import type { ProfileData } from '../StepProfile';

const defaultData: ProfileData = { firstName: '', lastName: '', phone: '' };

function makeProps(overrides = {}) {
  return {
    data: defaultData,
    email: 'test@example.com',
    onChange: vi.fn(),
    onNext: vi.fn(),
    isSubmitting: false,
    error: '',
    ...overrides,
  };
}

describe('StepProfile', () => {
  it('renders the profile form', () => {
    render(<StepProfile {...makeProps()} />);
    expect(screen.getByTestId('step-profile')).toBeInTheDocument();
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
  });

  it('shows the email as a disabled field', () => {
    render(<StepProfile {...makeProps()} />);
    const emailInput = screen.getByDisplayValue('test@example.com');
    expect(emailInput).toBeDisabled();
  });

  it('calls onChange when first name is typed', () => {
    const onChange = vi.fn();
    render(<StepProfile {...makeProps({ onChange })} />);
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Alice' } });
    expect(onChange).toHaveBeenCalledWith({ ...defaultData, firstName: 'Alice' });
  });

  it('calls onChange when last name is typed', () => {
    const onChange = vi.fn();
    render(<StepProfile {...makeProps({ onChange })} />);
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Smith' } });
    expect(onChange).toHaveBeenCalledWith({ ...defaultData, lastName: 'Smith' });
  });

  it('calls onNext when form is submitted', () => {
    const onNext = vi.fn();
    render(<StepProfile {...makeProps({ onNext })} />);
    fireEvent.submit(screen.getByTestId('step-profile'));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('disables the submit button while submitting', () => {
    render(<StepProfile {...makeProps({ isSubmitting: true })} />);
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });

  it('shows an error message when error prop is set', () => {
    render(<StepProfile {...makeProps({ error: 'Something went wrong' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('pre-fills data from props', () => {
    const data: ProfileData = { firstName: 'Bob', lastName: 'Jones', phone: '5551234567' };
    render(<StepProfile {...makeProps({ data })} />);
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Bob');
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Jones');
  });
});
