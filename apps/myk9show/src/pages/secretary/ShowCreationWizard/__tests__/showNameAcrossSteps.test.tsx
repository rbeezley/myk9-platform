/**
 * MYK9-1832: a show name she typed that happens to equal the club/month suggestion stays hers
 * after a look at Trials. Drives the real WizardStepContent and wizard store across the Show
 * details -> Trials -> Show details remount.
 */
import { act, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';

vi.mock('@/store/clubStore', () => {
  const state = {
    clubs: [{ id: 'club-1', name: 'Heartland', address: { city: 'Austin', state: 'TX' } }],
    loadClubs: vi.fn().mockResolvedValue(undefined),
    syncClubs: vi.fn(),
  };
  const useClubStore = Object.assign(
    (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state }
  );
  return { useClubStore };
});
vi.mock('@/store/userStore', () => {
  const state = {
    people: [],
    isLoading: false,
    loadPeople: vi.fn().mockResolvedValue(undefined),
    loadUsers: vi.fn().mockResolvedValue(undefined),
  };
  return {
    useUserStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
  };
});
vi.mock('@/hooks/useUserClubIds', () => ({ useUserClubIds: () => null }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: null, hasRole: () => false }),
}));
vi.mock('@/components/shows/wizard/steps/CloneFromShowCombobox', () => ({
  CloneFromShowCombobox: () => null,
}));
vi.mock('@/components/shows/wizard/steps/CloneStatusBanner', () => ({
  CloneStatusBanner: () => null,
}));
vi.mock('@/features/maps/VenueAddressAutocomplete', () => ({
  VenueAddressAutocomplete: () => <div />,
}));
vi.mock('@/components/common/LazyComponents', () => ({ VenuePinMap: () => null }));
vi.mock('@/components/shows/wizard/steps/TrialConfigurationStep', () => ({
  default: () => <div>Trials step</div>,
}));
vi.mock('@/components/shows/wizard/steps/ClassSelectionStep', () => ({ default: () => null }));
vi.mock('@/components/shows/wizard/steps/ReviewStep', () => ({ default: () => null }));

import { useWizardStore } from '@/store/wizardStore';
import { WizardStepContent } from '../WizardStepContent';
import { createWizardTrialView } from '@/utils/wizardTrialNames';

const day = (year: number, month: number, date: number) =>
  new Date(year, month - 1, date).toISOString();

function StepHost() {
  const currentStep = useWizardStore(state => state.currentStep);
  return (
    <WizardStepContent
      currentStep={currentStep}
      editMode={undefined}
      trialView={createWizardTrialView([], [])}
      existingTrialsReady
      existingClasses={[]}
      hasAttemptedNext={false}
      isLoading={false}
      onCreateShow={vi.fn()}
      onBack={vi.fn()}
    />
  );
}

const goToStep = (currentStep: number) => act(() => useWizardStore.setState({ currentStep }));

describe('show name across Show details and Trials', () => {
  beforeEach(() => {
    useWizardStore.getState().resetWizard();
    useWizardStore.getState().updateShowData({ clubId: 'club-1' });
  });

  it('keeps a typed name that equals the suggestion when the month changes after Trials', () => {
    render(<StepHost />);
    fireEvent.change(screen.getByPlaceholderText('Enter show name'), {
      target: { value: 'Heartland October 2026' },
    });
    act(() => useWizardStore.getState().updateShowData({ startDate: day(2026, 10, 10) }));
    expect(useWizardStore.getState().show.name).toBe('Heartland October 2026');

    goToStep(1);
    expect(screen.getByText('Trials step')).toBeInTheDocument();
    goToStep(0);
    act(() => useWizardStore.getState().updateShowData({ startDate: day(2026, 11, 14) }));

    expect(useWizardStore.getState().show.name).toBe('Heartland October 2026');
  });

  it('still follows the month after Trials when the name is the suggestion itself', () => {
    render(<StepHost />);
    act(() => useWizardStore.getState().updateShowData({ startDate: day(2026, 10, 10) }));
    expect(useWizardStore.getState().show.name).toBe('Heartland October 2026');

    goToStep(1);
    goToStep(0);
    act(() => useWizardStore.getState().updateShowData({ startDate: day(2026, 11, 14) }));

    expect(useWizardStore.getState().show.name).toBe('Heartland November 2026');
  });
});
