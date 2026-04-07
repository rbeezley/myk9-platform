import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { StepDogs } from '../StepDogs';

// useDogsQuery is called inside StepDogs — mock it so tests don't hit the DB
vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsQuery: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateDogMutation: vi.fn(() => ({ mutateAsync: vi.fn() })),
}));

// AddDogPanel opens a full panel — stub it so tests stay unit-level
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
  it('renders the empty state when user has no dogs', () => {
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

  it('opens AddDogPanel when Add a dog is clicked', () => {
    render(<StepDogs {...makeProps()} />);
    expect(screen.queryByTestId('add-dog-panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add a dog/i }));
    expect(screen.getByTestId('add-dog-panel')).toBeInTheDocument();
  });

  it('closes AddDogPanel when panel closes itself', () => {
    render(<StepDogs {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /add a dog/i }));
    fireEvent.click(screen.getByRole('button', { name: /close panel/i }));
    expect(screen.queryByTestId('add-dog-panel')).not.toBeInTheDocument();
  });

  it('calls onNext when Next is clicked', () => {
    const onNext = vi.fn();
    render(<StepDogs {...makeProps({ onNext })} />);
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('shows dog list when user already has dogs', async () => {
    const { useDogsQuery } = await import('@/hooks/queries/useDogsDatabase');
    vi.mocked(useDogsQuery).mockReturnValueOnce({
      data: [{ id: 'd1', call_name: 'Rex', name: 'Rex', breed: 'Labrador', registrations: [] }],
      isLoading: false,
    } as never);
    render(<StepDogs {...makeProps()} />);
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText(/labrador/i)).toBeInTheDocument();
  });
});
