import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { useUserStore } from '@/store/userStore';
import { resetQuickCreateMocks } from '@/test/quickCreate/quickCreateFlowMocks';
import { dialogs, JOURNEY_TIMEOUT_MS, panel } from '@/test/quickCreate/quickCreateFlowKit';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';

// MYK9-1081: the wizard's Create New → "Exhibitor & Dog(s)" opens ONE slide-out with the
// Person form inside it. QuickCreateFlow is deliberately NOT mocked here, unlike
// the other DogSelectionStepEnhanced render files, so this pins the real chain.
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
vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));
vi.mock('@/services/database/users', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/users')>()),
  ...(await import('@/test/quickCreate/quickCreateFlowMocks')).usersModule,
}));
vi.mock('@/services/database/dogs', () => ({ SEARCH_ALL_DOGS_LIMIT: 25, searchAllDogs: vi.fn() }));

beforeEach(() => {
  resetQuickCreateMocks();
  useUserStore.setState({ people: [], users: [] });
});

describe('DogSelectionStepEnhanced Exhibitor & Dog(s)', { timeout: JOURNEY_TIMEOUT_MS }, () => {
  it('opens one slide-out with the Person form inside it', async () => {
    const { user } = render(
      <DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /Create New/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Exhibitor & Dog/ }));
    await screen.findByLabelText(/First Name/i);

    expect(dialogs()).toHaveLength(1);
    expect(panel()).not.toBeNull();
    expect(within(panel() as HTMLElement).getByLabelText(/First Name/i)).toBeInTheDocument();
  });
});
