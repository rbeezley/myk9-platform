/**
 * The Edit panel of a dog opened from the person page offers Delete only to a viewer
 * `soft_delete_dog` accepts (owner or site admin), via the same `useCanDeleteDog` gate the
 * dog page uses. A secretary looking at someone else's dog does not see it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';

const gate = vi.hoisted(() => ({ allowed: new Set<string>() }));
vi.mock('@/hooks/useRoleBasedData', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useRoleBasedData')>()),
  useCanDeleteDog: (dogId: string) => gate.allowed.has(dogId),
}));

const dogs: Dog[] = [
  {
    id: 'd1',
    name: 'Biscuit Registered',
    callName: 'Biscuit',
    breed: 'Beagle',
    sex: 'male',
    ownerId: 'p1',
    ownerName: 'Jane Smith',
    status: 'active',
  },
];
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs, updateDog: vi.fn() }),
}));
vi.mock('@/components/common/PhotoDialog', () => ({ default: () => null }));
vi.mock('@/components/panels/edit', () => ({ AddDogPanel: () => null }));
vi.mock('@/components/panels/edit/DogEditPanel', () => ({
  DogEditPanel: ({ open, onDelete }: { open: boolean; onDelete?: { kind: string } }) =>
    open ? <div data-testid="dog-edit-panel" data-delete={onDelete?.kind ?? ''} /> : null,
}));

import UserDetailsTabs from './UserDetailsTabs';

async function openDogEditPanel() {
  const selectedUser = {
    id: 'p1',
    firstName: 'Jane',
    lastName: 'Smith',
  } as unknown as Parameters<typeof UserDetailsTabs>[0]['selectedUser'];
  const { user } = render(<UserDetailsTabs selectedUser={selectedUser} />);
  await user.click(screen.getByRole('button', { name: 'Dog actions for Biscuit' }));
  await user.click(await screen.findByRole('menuitem', { name: /edit/i }));
  return screen.findByTestId('dog-edit-panel');
}

describe('dog Edit panel opened from the person page', () => {
  beforeEach(() => {
    gate.allowed.clear();
  });

  it('offers Delete dog to the owner (or a site admin)', async () => {
    gate.allowed.add('d1');
    expect(await openDogEditPanel()).toHaveAttribute('data-delete', 'dog');
  });

  it('offers no Delete to a secretary viewing someone else’s dog', async () => {
    expect(await openDogEditPanel()).toHaveAttribute('data-delete', '');
  });
});
