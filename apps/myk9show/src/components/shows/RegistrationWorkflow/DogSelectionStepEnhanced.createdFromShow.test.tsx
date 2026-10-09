import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';

// MYK9-1059: every creation surface the wizard's dog step opens must be handed
// the show being entered, so the dog or person it creates is attributed to it.
const SHOW_ID = '6349d047-34fe-4307-b29a-c1ae6d7750c7';

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: [], isLoading: false }),
}));
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
    workflowConfig: { features: { advancedSearch: false, createNew: true } },
  }),
}));
vi.mock('@/components/shows/RegistrationWorkflow/CreateExhibitorDialog', () => ({
  CreateExhibitorDialog: (props: { createdFromShowId?: string }) => (
    <div data-testid="create-exhibitor">{props.createdFromShowId ?? 'none'}</div>
  ),
}));
vi.mock('@/components/shows/RegistrationWorkflow/QuickCreateFlow', () => ({
  QuickCreateFlow: (props: { createdFromShowId?: string }) => (
    <div data-testid="quick-create">{props.createdFromShowId ?? 'none'}</div>
  ),
}));
vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: (props: { createdFromShowId?: string }) => (
    <div data-testid="add-dog">{props.createdFromShowId ?? 'none'}</div>
  ),
}));
vi.mock('@/services/database/dogs', () => ({ SEARCH_ALL_DOGS_LIMIT: 25, searchAllDogs: vi.fn() }));

describe('DogSelectionStepEnhanced createdFromShowId', () => {
  it('hands the show id to Quick Create, Add Person and Add Dog', () => {
    render(
      <DogSelectionStepEnhanced
        selectedDogs={[]}
        onSelectionChange={vi.fn()}
        createdFromShowId={SHOW_ID}
      />
    );
    expect(screen.getByTestId('quick-create')).toHaveTextContent(SHOW_ID);
    expect(screen.getByTestId('create-exhibitor')).toHaveTextContent(SHOW_ID);
    expect(screen.getByTestId('add-dog')).toHaveTextContent(SHOW_ID);
  });

  it('hands nothing down when no show id is supplied', () => {
    render(<DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />);
    expect(screen.getByTestId('quick-create')).toHaveTextContent('none');
    expect(screen.getByTestId('create-exhibitor')).toHaveTextContent('none');
    expect(screen.getByTestId('add-dog')).toHaveTextContent('none');
  });
});
