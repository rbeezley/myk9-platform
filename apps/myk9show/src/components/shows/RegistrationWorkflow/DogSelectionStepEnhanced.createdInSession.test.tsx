import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { UserRole } from '@/types/auth-types';
import type { Dog, User } from '@/types/dog-types';
import { CreatedInSessionProvider, useCreatedInSession } from './CreatedInSessionContext';
import { describeNoEntryYet } from './createdInSession';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';

// The wizard's leave prompt only knows what the creation dialogs report. These
// pin that each real creation callback reaches the session record, and that
// selecting an existing dog does not (MYK9-1058).
const newOwner = { id: 'o1', firstName: 'Pat', lastName: 'Lee' } as User;
const newDog = { id: 'd1', name: 'Cracker Registered', callName: 'Cracker', ownerId: 'o1' } as Dog;
const existingDog = { id: 'd0', name: 'Old Timer', ownerId: 'o0' } as Dog;

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: [existingDog], isLoading: false }),
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
  CreateExhibitorDialog: (props: { onExhibitorCreated: (owner: User) => void }) => (
    <button onClick={() => props.onExhibitorCreated(newOwner)}>save owner</button>
  ),
}));
vi.mock('@/components/shows/RegistrationWorkflow/QuickCreateFlow', () => ({
  QuickCreateFlow: () => null,
}));
vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: (props: { onDogCreated: (dog: Dog) => void }) => (
    <button onClick={() => props.onDogCreated(newDog)}>save dog</button>
  ),
}));
vi.mock('@/services/database/dogs', () => ({ SEARCH_ALL_DOGS_LIMIT: 25, searchAllDogs: vi.fn() }));

function Summary() {
  const session = useCreatedInSession();
  return <p data-testid="summary">{session ? describeNoEntryYet(session.created) : 'none'}</p>;
}

function renderStep(onSelectionChange = vi.fn()) {
  render(
    <CreatedInSessionProvider>
      <DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={onSelectionChange} />
      <Summary />
    </CreatedInSessionProvider>
  );
}

describe('DogSelectionStepEnhanced reports creations to the wizard session', () => {
  it('records a dog saved from Add Dog', async () => {
    renderStep();
    await userEvent.click(screen.getByText('save dog'));
    expect(screen.getByTestId('summary')).toHaveTextContent('Cracker has no entry yet.');
  });

  it('records an owner saved from Add Person', async () => {
    renderStep();
    await userEvent.click(screen.getByText('save owner'));
    expect(screen.getByTestId('summary')).toHaveTextContent('Pat Lee has no entry yet.');
  });

  it('records nothing when she only selects a dog that already existed', async () => {
    const onSelectionChange = vi.fn();
    renderStep(onSelectionChange);
    await userEvent.click(screen.getByRole('checkbox', { name: /Old Timer/i }));
    expect(onSelectionChange).toHaveBeenCalled();
    expect(screen.getByTestId('summary')).toHaveTextContent('');
  });
});
