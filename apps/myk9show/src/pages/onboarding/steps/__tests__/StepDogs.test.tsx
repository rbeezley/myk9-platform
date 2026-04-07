import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { StepDogs } from '../StepDogs';
import type { DogEntry } from '../StepDogs';

function makeProps(overrides = {}) {
  return {
    dogs: [] as DogEntry[],
    onChange: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    onSkip: vi.fn(),
    ...overrides,
  };
}

describe('StepDogs', () => {
  it('renders the empty state when no dogs', () => {
    render(<StepDogs {...makeProps()} />);
    expect(screen.getByTestId('step-dogs')).toBeInTheDocument();
    expect(screen.getByText(/no dogs added yet/i)).toBeInTheDocument();
  });

  it('calls onSkip when skip button is clicked', () => {
    const onSkip = vi.fn();
    render(<StepDogs {...makeProps({ onSkip })} />);
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn();
    render(<StepDogs {...makeProps({ onBack })} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('calls onChange with a new dog when Add a dog is clicked', () => {
    const onChange = vi.fn();
    render(<StepDogs {...makeProps({ onChange })} />);
    fireEvent.click(screen.getByRole('button', { name: /add a dog/i }));
    expect(onChange).toHaveBeenCalledOnce();
    const [newDogs] = onChange.mock.calls[0];
    expect(newDogs).toHaveLength(1);
    expect(newDogs[0]).toMatchObject({ callName: '', breed: '' });
  });

  it('renders dog entry fields when dogs are present', () => {
    const dogs: DogEntry[] = [
      {
        id: 'dog-1',
        callName: 'Rex',
        registeredName: '',
        breed: 'Labrador',
        registrationNumber: '',
      },
    ];
    render(<StepDogs {...makeProps({ dogs })} />);
    expect(screen.getByTestId('dog-entry-0')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Rex')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Labrador')).toBeInTheDocument();
  });

  it('Next button is disabled when no dogs', () => {
    render(<StepDogs {...makeProps()} />);
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled();
  });

  it('Next button is enabled when at least one dog exists', () => {
    const dogs: DogEntry[] = [
      {
        id: 'dog-1',
        callName: 'Max',
        registeredName: '',
        breed: 'Poodle',
        registrationNumber: '',
      },
    ];
    render(<StepDogs {...makeProps({ dogs })} />);
    expect(screen.getByRole('button', { name: /^next$/i })).not.toBeDisabled();
  });
});
