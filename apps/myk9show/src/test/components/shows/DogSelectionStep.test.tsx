import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { DogSelectionStep } from '@/components/shows/RegistrationWorkflow/DogSelectionStep';
import type { Dog } from '@/types/dog-types';
import { fromPartial } from '@total-typescript/shoehorn';

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
  // The 252-dog case renders the full list three times (initial, filtered,
  // cleared) and types nine characters through it, which is the point of the
  // case — it is why the search has to survive a long roster. Measured at ~5.3s
  // in isolation on this machine and ~16s under `--coverage` alongside the rest
  // of the file, so the 10s default cap fails it on any loaded runner. CI hit
  // it on `main` from the moment it landed (#2004).
  it.each([3, 252])(
    'finds the last of %i dogs and preserves hidden selections',
    { timeout: 45000 },
    async count => {
      const dogs = Array.from({ length: count }, (_, index) =>
        mockDog({
          id: `dog-${index + 1}`,
          callName: index === count - 1 ? 'Willow' : `Buddy ${index + 1}`,
        })
      );
      vi.mocked(useDogStoreCompat).mockReturnValue(fromPartial({ dogs, isLoading: false }));
      const onSelectionChange = vi.fn();
      const { user, rerender } = render(
        <DogSelectionStep selectedDogs={['dog-1']} onSelectionChange={onSelectionChange} />
      );
      await user.type(
        screen.getByRole('textbox', { name: /search dogs by call name/i }),
        '  wILLo  '
      );
      expect(screen.getAllByRole('checkbox')).toHaveLength(1);
      const willow = screen.getByRole('checkbox', { name: 'Select Willow' });
      willow.focus();
      await user.keyboard('[Space]');
      expect(onSelectionChange).toHaveBeenCalledWith(['dog-1', `dog-${count}`]);
      rerender(
        <DogSelectionStep
          selectedDogs={['dog-1', `dog-${count}`]}
          onSelectionChange={onSelectionChange}
        />
      );
      await user.click(screen.getByRole('button', { name: 'Clear search' }));
      expect(screen.getAllByRole('checkbox')).toHaveLength(count);
      expect(screen.getByRole('checkbox', { name: 'Select Buddy 1' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Select Willow' })).toBeChecked();
    }
  );

  it('distinguishes no matches from no dogs and retains restored selections', async () => {
    vi.mocked(useDogStoreCompat).mockReturnValue(
      fromPartial({ dogs: [mockDog()], isLoading: false })
    );
    const onSelectionChange = vi.fn();
    const { user } = render(
      <DogSelectionStep selectedDogs={['dog-1']} onSelectionChange={onSelectionChange} />
    );
    await user.type(screen.getByRole('textbox', { name: /search dogs by call name/i }), 'missing');
    expect(screen.getByRole('status')).toHaveTextContent('No dogs match your search');
    expect(screen.queryByText('No eligible dogs found.')).not.toBeInTheDocument();
    expect(screen.getByText('1 dog selected')).toBeInTheDocument();
    expect(onSelectionChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('checkbox', { name: 'Select Max' })).toBeChecked();
  });

  it('shows a retryable load failure rather than an empty list', async () => {
    const refetch = vi.fn();
    vi.mocked(useDogStoreCompat).mockReturnValue(
      fromPartial({ dogs: [], isLoading: false, error: 'Request failed', refetch })
    );
    const { user } = render(
      <DogSelectionStep selectedDogs={['dog-1']} onSelectionChange={vi.fn()} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load your dogs");
    expect(screen.queryByText('No eligible dogs found.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('uses the page scroll on phones and constrains only medium viewports and wider', () => {
    vi.mocked(useDogStoreCompat).mockReturnValue({
      dogs: [mockDog()],
      isLoading: false,
    } as ReturnType<typeof useDogStoreCompat>);

    const { container } = render(
      <DogSelectionStep selectedDogs={[]} onSelectionChange={() => {}} />
    );

    const scrollArea = container.querySelector('.h-auto');
    expect(scrollArea).toHaveClass('md:h-[400px]');
    expect(scrollArea).not.toHaveClass('h-[55vh]');
  });

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
    expect(screen.getByRole('button', { name: /add registration/i })).toBeInTheDocument();
  });

  it('opens the shared registration editor without changing the selected dogs', async () => {
    vi.mocked(useDogStoreCompat).mockReturnValue({
      dogs: [mockDog({ registrations: [] })],
      isLoading: false,
      updateDog: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDogStoreCompat>);
    const onSelectionChange = vi.fn();
    const { user } = render(
      <DogSelectionStep selectedDogs={['dog-1']} onSelectionChange={onSelectionChange} />
    );

    await user.click(screen.getByRole('button', { name: /add registration/i }));

    expect(await screen.findByText('Add New Registration')).toBeInTheDocument();
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(screen.getByText('Selected')).toBeInTheDocument();
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

    render(<DogSelectionStep selectedDogs={[]} onSelectionChange={() => {}} />);

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
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
  });

  // A <Label htmlFor> pointed at this checkbox labelled Base UI's HIDDEN input,
  // so clicking the dog name both bubbled to the card and label-activated the
  // input: two toggles, and two registrations created. toHaveBeenCalledWith
  // alone cannot see it — both calls carry the same argument — so this asserts
  // the COUNT, which is the only thing that distinguishes the regression.
  it('toggles exactly once when the dog name is clicked', async () => {
    vi.mocked(useDogStoreCompat).mockReturnValue({
      dogs: [mockDog()],
      isLoading: false,
    } as ReturnType<typeof useDogStoreCompat>);

    const onSelectionChange = vi.fn();
    const { user } = render(
      <DogSelectionStep selectedDogs={[]} onSelectionChange={onSelectionChange} />
    );

    await user.click(screen.getByText(/Max/i));

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
  });

  it('gives the selection checkbox an accessible name', () => {
    vi.mocked(useDogStoreCompat).mockReturnValue({
      dogs: [mockDog()],
      isLoading: false,
    } as ReturnType<typeof useDogStoreCompat>);

    render(<DogSelectionStep selectedDogs={[]} onSelectionChange={vi.fn()} />);

    // Was announced as a bare "checkbox, unchecked" on the exhibitor's first step.
    expect(screen.getByRole('checkbox', { name: /Max/i })).toBeInTheDocument();
  });

  it('shows loading state while dogs are loading', () => {
    vi.mocked(useDogStoreCompat).mockReturnValue(
      fromPartial({
        dogs: [],
        isLoading: true,
      })
    );

    render(<DogSelectionStep selectedDogs={[]} onSelectionChange={() => {}} />);

    expect(screen.getByRole('status', { name: /loading your dogs/i })).toBeInTheDocument();
  });

  it('shows empty state when no eligible dogs exist', () => {
    vi.mocked(useDogStoreCompat).mockReturnValue(
      fromPartial({
        dogs: [],
        isLoading: false,
      })
    );

    render(<DogSelectionStep selectedDogs={[]} onSelectionChange={() => {}} />);

    expect(screen.getByText(/no eligible dogs found/i)).toBeInTheDocument();
  });
});
