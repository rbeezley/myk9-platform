import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { DogSelectionStep } from '@/components/shows/RegistrationWorkflow/DogSelectionStep';
import type { Dog } from '@/types/dog-types';

// Mock the dog store compat hook
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: vi.fn(),
}));

import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';

const mockDog = (overrides: Partial<Dog> = {}): Dog => ({
  id: 'dog-1',
  name: 'Champion Max',
  callName: 'Max',
  breed: 'Golden Retriever',
  sex: 'male',
  gender: 'Male',
  ownerId: 'owner-1',
  dateOfBirth: '2020-01-01', // ~4+ years old, well above 6 months
  registrations: [],
  status: 'active',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DogSelectionStep', () => {
  it('renders an enabled checkbox for an eligible dog with no registrations loaded', () => {
    // Simulates the replication path where registrations array is always empty
    vi.mocked(useDogStoreCompat).mockReturnValue({
      dogs: [mockDog({ registrations: [] })],
      isLoading: false,
    } as ReturnType<typeof useDogStoreCompat>);

    render(<DogSelectionStep selectedDogs={[]} onSelectionChange={() => {}} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeDisabled();
  });

  it('renders an enabled checkbox for an eligible dog with registrations', () => {
    vi.mocked(useDogStoreCompat).mockReturnValue({
      dogs: [
        mockDog({
          registrations: [
            {
              id: 'reg-1',
              organization: 'AKC',
              registeredName: 'Champion Max',
              breed: 'Golden Retriever',
              registrationNumber: 'SS12345678',
              status: 'Active',
            },
          ],
        }),
      ],
      isLoading: false,
    } as ReturnType<typeof useDogStoreCompat>);

    render(<DogSelectionStep selectedDogs={[]} onSelectionChange={() => {}} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeDisabled();
  });

  it('renders a disabled checkbox for a dog that is too young', () => {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    vi.mocked(useDogStoreCompat).mockReturnValue({
      dogs: [mockDog({ dateOfBirth: twoMonthsAgo.toISOString() })],
      isLoading: false,
    } as ReturnType<typeof useDogStoreCompat>);

    render(<DogSelectionStep selectedDogs={[]} onSelectionChange={() => {}} />);

    // shadcn Checkbox uses Base UI — disabled state is expressed via aria-disabled, not the
    // native disabled attribute, so we check aria-disabled="true".
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/too young/i)).toBeInTheDocument();
  });

  it('shows a warning (not disabled) when registrations array is explicitly empty', () => {
    vi.mocked(useDogStoreCompat).mockReturnValue({
      dogs: [mockDog({ registrations: [] })],
      isLoading: false,
    } as ReturnType<typeof useDogStoreCompat>);

    render(<DogSelectionStep selectedDogs={[]} onSelectionChange={() => {}} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeDisabled();
    expect(screen.getByText(/no registration on file/i)).toBeInTheDocument();
  });

  it('does not show registration warning when registrations is undefined (replication path)', () => {
    // When loaded via replication, the Dog object may have registrations: undefined
    // vs explicitly empty — should not show warning either way
    vi.mocked(useDogStoreCompat).mockReturnValue({
      dogs: [mockDog({ registrations: undefined })],
      isLoading: false,
    } as ReturnType<typeof useDogStoreCompat>);

    render(<DogSelectionStep selectedDogs={[]} onSelectionChange={() => {}} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeDisabled();
    expect(screen.queryByText(/no registration on file/i)).not.toBeInTheDocument();
  });

  it('shows the selected badge when dog is checked', async () => {
    vi.mocked(useDogStoreCompat).mockReturnValue({
      dogs: [mockDog()],
      isLoading: false,
    } as ReturnType<typeof useDogStoreCompat>);

    const { user } = render(<DogSelectionStep selectedDogs={[]} onSelectionChange={() => {}} />);

    expect(screen.queryByText('Selected')).not.toBeInTheDocument();

    render(<DogSelectionStep selectedDogs={['dog-1']} onSelectionChange={() => {}} />);

    expect(screen.getByText('Selected')).toBeInTheDocument();
  });

  it('calls onSelectionChange when an eligible dog checkbox is toggled', async () => {
    vi.mocked(useDogStoreCompat).mockReturnValue({
      dogs: [mockDog()],
      isLoading: false,
    } as ReturnType<typeof useDogStoreCompat>);

    const onSelectionChange = vi.fn();
    const { user } = render(
      <DogSelectionStep selectedDogs={[]} onSelectionChange={onSelectionChange} />
    );

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    expect(onSelectionChange).toHaveBeenCalledWith(['dog-1']);
  });

  it('shows loading state while dogs are loading', () => {
    vi.mocked(useDogStoreCompat).mockReturnValue({
      dogs: [],
      isLoading: true,
    } as ReturnType<typeof useDogStoreCompat>);

    render(<DogSelectionStep selectedDogs={[]} onSelectionChange={() => {}} />);

    expect(screen.getByText(/loading your dogs/i)).toBeInTheDocument();
  });

  it('shows empty state when no eligible dogs exist', () => {
    vi.mocked(useDogStoreCompat).mockReturnValue({
      dogs: [],
      isLoading: false,
    } as ReturnType<typeof useDogStoreCompat>);

    render(<DogSelectionStep selectedDogs={[]} onSelectionChange={() => {}} />);

    expect(screen.getByText(/no eligible dogs found/i)).toBeInTheDocument();
  });
});
