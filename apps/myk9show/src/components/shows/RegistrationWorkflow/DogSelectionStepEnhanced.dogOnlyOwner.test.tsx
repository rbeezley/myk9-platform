/**
 * MYK9-1119: Create New → Dog Only opens Add Dog with NO default owner. The
 * step used to remember the person Exhibitor Only had just created and hand it
 * to every later Dog Only; that menu item is gone, so nothing can seed an owner
 * here. Quick Create (which owns its own Add Dog) is stubbed out.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import type { AddDogPanelProps } from '@/components/panels/edit/AddDogPanel/types';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';

const dogPanel = vi.hoisted(() => ({ props: undefined as unknown }));

vi.mock('@/hooks/useDogStoreCompat', () => {
  // One stable array: a fresh `dogs` every render loops the step's effects.
  const dogs: unknown[] = [];
  return { useDogStoreCompat: () => ({ dogs, isLoading: false }) };
});
vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => ({
    user: { id: 'u1' },
    roles: [UserRole.SECRETARY],
    canBulkOperations: true,
    canCreateExhibitor: true,
    getMaxDogsPerRegistration: () => 50,
  }),
}));
vi.mock('@/hooks/useRegistrationContext', () => ({
  useRegistrationContext: () => ({
    workflowConfig: { features: { advancedSearch: true, createNew: true } },
  }),
}));
vi.mock('./QuickCreateFlow', () => ({ QuickCreateFlow: () => null }));
vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: (props: AddDogPanelProps) => {
    dogPanel.props = props;
    return props.open ? <div data-testid="stub-add-dog" /> : null;
  },
}));
vi.mock('@/services/database/dogs', () => ({ SEARCH_ALL_DOGS_LIMIT: 25, searchAllDogs: vi.fn() }));

describe('Create New → Dog Only owner', () => {
  it('hands Add Dog no owner and no queued-write dependencies', async () => {
    const { user } = render(
      <DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: /Create New/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Dog Only/ }));
    await screen.findByTestId('stub-add-dog');

    const props = dogPanel.props as AddDogPanelProps;
    expect(props.open).toBe(true);
    expect(props.currentUserPersonId).toBeUndefined();
    expect(props.offlineDependsOn).toBeUndefined();
  });
});
