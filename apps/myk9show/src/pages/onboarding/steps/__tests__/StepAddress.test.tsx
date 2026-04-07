import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { StepAddress } from '../StepAddress';
import type { AddressData } from '../StepAddress';

const defaultData: AddressData = { street: '', city: '', state: '', zip: '' };

function makeProps(overrides = {}) {
  return {
    data: defaultData,
    onChange: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    onSkip: vi.fn(),
    ...overrides,
  };
}

describe('StepAddress', () => {
  it('renders the address form', () => {
    render(<StepAddress {...makeProps()} />);
    expect(screen.getByTestId('step-address')).toBeInTheDocument();
    expect(screen.getByLabelText(/street address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/state/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/zip/i)).toBeInTheDocument();
  });

  it('calls onSkip when skip is clicked', () => {
    const onSkip = vi.fn();
    render(<StepAddress {...makeProps({ onSkip })} />);
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('calls onBack when back is clicked', () => {
    const onBack = vi.fn();
    render(<StepAddress {...makeProps({ onBack })} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('calls onChange when street is typed', () => {
    const onChange = vi.fn();
    render(<StepAddress {...makeProps({ onChange })} />);
    fireEvent.change(screen.getByLabelText(/street address/i), {
      target: { value: '123 Oak Ave' },
    });
    expect(onChange).toHaveBeenCalledWith({ ...defaultData, street: '123 Oak Ave' });
  });

  it('calls onNext on form submit', () => {
    const onNext = vi.fn();
    render(<StepAddress {...makeProps({ onNext })} />);
    fireEvent.submit(screen.getByTestId('step-address'));
    expect(onNext).toHaveBeenCalledOnce();
  });
});
