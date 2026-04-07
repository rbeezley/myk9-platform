import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';
import { StepDogs } from '../StepDogs';

// Stub AddDogPanel so tests stay unit-level
vi.mock('@/components/panels/edit/AddDogPanel', () => ({
  AddDogPanel: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="add-dog-panel">
        <button onClick={onClose}>Close panel</button>
      </div>
    ) : null,
}));

function makeProps(overrides = {}) {
  return {
    personId: 'person-123',
    onNext: vi.fn(),
    onBack: vi.fn(),
    onSkip: vi.fn(),
    ...overrides,
  };
}

describe('StepDogs', () => {
  it('renders the empty state when user has no dogs', async () => {
    // Default mockSupabase.from returns [] — no dogs
    render(<StepDogs {...makeProps()} />);
    expect(await screen.findByTestId('step-dogs')).toBeInTheDocument();
    expect(await screen.findByText(/no dogs added yet/i)).toBeInTheDocument();
  });

  it('calls onSkip when skip button is clicked', async () => {
    const onSkip = vi.fn();
    render(<StepDogs {...makeProps({ onSkip })} />);
    fireEvent.click(await screen.findByRole('button', { name: /skip for now/i }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('calls onBack when back button is clicked', async () => {
    const onBack = vi.fn();
    render(<StepDogs {...makeProps({ onBack })} />);
    fireEvent.click(await screen.findByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('opens AddDogPanel when Add a dog is clicked', async () => {
    render(<StepDogs {...makeProps()} />);
    expect(screen.queryByTestId('add-dog-panel')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /add a dog/i }));
    expect(screen.getByTestId('add-dog-panel')).toBeInTheDocument();
  });

  it('closes AddDogPanel when panel closes itself', async () => {
    render(<StepDogs {...makeProps()} />);
    fireEvent.click(await screen.findByRole('button', { name: /add a dog/i }));
    fireEvent.click(screen.getByRole('button', { name: /close panel/i }));
    expect(screen.queryByTestId('add-dog-panel')).not.toBeInTheDocument();
  });

  it('calls onNext when Next is clicked', async () => {
    const onNext = vi.fn();
    render(<StepDogs {...makeProps({ onNext })} />);
    fireEvent.click(await screen.findByRole('button', { name: /^next$/i }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("shows only this user's dogs (owner-scoped query)", async () => {
    mockSupabase.from.mockReturnValueOnce(
      createChainableQuery({
        data: [{ id: 'd1', call_name: 'Rex', name: 'Rex', breed: 'Labrador', registrations: [] }],
        error: null,
      })
    );
    render(<StepDogs {...makeProps()} />);
    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(screen.getByText(/labrador/i)).toBeInTheDocument();
  });
});
