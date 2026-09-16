/**
 * MYK9-569 — the dog card must say which registration this show will use, and
 * must not let an exhibitor walk into `trg_entries_require_dog_registration`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { DogSelectionStep } from '@/components/shows/RegistrationWorkflow/DogSelectionStep';
import type { Dog, Registration } from '@/types/dog-types';
import { fromPartial } from '@total-typescript/shoehorn';

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: vi.fn(),
}));

import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';

const registration = (overrides: Partial<Registration>): Registration => ({
  id: 'reg',
  organization: 'AKC',
  registeredName: 'Champion Maple',
  breed: 'Golden Retriever',
  registrationNumber: 'SR12345601',
  status: 'Active',
  ...overrides,
});

const AKC = registration({ id: 'reg-akc' });
const UKC = registration({ id: 'reg-ukc', organization: 'UKC', registrationNumber: 'P987-654' });
const ASCA = registration({ id: 'reg-asca', organization: 'ASCA', registrationNumber: 'E123456' });

const mockDog = (registrations: Registration[]): Dog =>
  fromPartial<Dog>({
    id: 'dog-1',
    name: 'Champion Maple',
    callName: 'Maple',
    breed: 'Golden Retriever',
    gender: 'Female',
    ownerId: 'owner-1',
    dateOfBirth: '2020-01-01',
    status: 'active',
    registrations,
  });

const mountWith = (registrations: Registration[], showRegistryId?: string) => {
  vi.mocked(useDogStoreCompat).mockReturnValue(
    fromPartial({ dogs: [mockDog(registrations)], isLoading: false })
  );
  const onSelectionChange = vi.fn();
  return {
    onSelectionChange,
    ...render(
      <DogSelectionStep
        selectedDogs={[]}
        onSelectionChange={onSelectionChange}
        {...(showRegistryId ? { showRegistryId } : {})}
      />
    ),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DogSelectionStep — the registration this show will use', () => {
  it('marks the matching registration and de-emphasizes the others', () => {
    mountWith([AKC, UKC, ASCA], 'AKC');

    const used = screen.getByTestId('registration-used');
    expect(within(used).getByText(/SR12345601/)).toBeInTheDocument();
    expect(within(used).getByText('Used for this show')).toBeInTheDocument();

    const others = screen.getAllByTestId('registration-other');
    expect(others).toHaveLength(2);
    expect(others.map(node => node.textContent).join(' ')).toContain('P987-654');
    expect(others.map(node => node.textContent).join(' ')).toContain('E123456');
    // Shown, not hidden — she still needs to see her dog's other numbers exist.
    for (const other of others) {
      expect(other).toBeVisible();
      expect(other.className).toMatch(/opacity-/);
    }
    expect(screen.queryByText(/registration to enter this show/)).not.toBeInTheDocument();
  });

  it.each(['UKC', 'ASCA'])('marks the %s registration for that show', registry => {
    mountWith([AKC, UKC, ASCA], registry);

    const used = screen.getByTestId('registration-used');
    expect(used.textContent).toContain(registry);
    expect(screen.getAllByTestId('registration-other')).toHaveLength(2);
  });

  it('names the fix and blocks selection when no registration matches the show registry', async () => {
    const { onSelectionChange, user } = mountWith([UKC, ASCA], 'AKC');

    expect(screen.getByText(/Add an AKC registration to enter this show/)).toBeInTheDocument();
    expect(screen.queryByTestId('registration-used')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Select Maple/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    // Not merely styled as blocked — clicking the card must not select the dog,
    // because the entry would die on trg_entries_require_dog_registration.
    await user.click(screen.getByText(/Golden Retriever/));
    expect(onSelectionChange).not.toHaveBeenCalled();
    // The fix is one tap away, not a dead end.
    expect(screen.getByRole('button', { name: /Add registration/ })).toBeInTheDocument();
  });

  it('marks nothing and blocks nobody when the show registry is not known yet', async () => {
    const { onSelectionChange, user } = mountWith([AKC, UKC], undefined);

    expect(screen.queryByTestId('registration-used')).not.toBeInTheDocument();
    expect(screen.queryByText(/registration to enter this show/)).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Select Maple/ })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await user.click(screen.getByText(/Golden Retriever/));
    expect(onSelectionChange).toHaveBeenCalledWith(['dog-1']);
  });
});
