import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { EditPanelWrapper } from '../EditPanelWrapper';
import { DogEditContext } from '../DogEditPanel';
import { BasicInfoTab } from '../DogEditPanel.sections';
import { DogEditPanel } from '../DogEditPanel';
import type { DogFormData } from '../DogEditPanel.types';
import { UserRole } from '@/types/auth-types';

// Mock supabase client (BasicInfoTab pulls people via OwnerSelectionField's
// query hook when isAdmin, which this suite never enables).
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const defaultFormData: DogFormData = {
  callName: 'Rex',
  gender: 'male',
  dateOfBirth: '2020-01-01',
  color: 'black',
  weight: '50',
  height: '24',
  microchip: '',
  imageUrl: '',
  ownerId: '',
  registrations: [],
  healthRecords: {},
};

function renderBasicInfoTab() {
  return render(
    <DogEditContext.Provider value={{ isAdmin: false, people: [] }}>
      <EditPanelWrapper
        open={true}
        onClose={vi.fn()}
        title="Test"
        initialData={defaultFormData}
        onSave={vi.fn()}
        forceHasChanges
      >
        <BasicInfoTab
          handleInputChange={() => vi.fn()}
          handleSelectChange={() => vi.fn()}
          onOpenPhotoModal={vi.fn()}
        />
      </EditPanelWrapper>
    </DogEditContext.Provider>
  );
}

describe('BasicInfoTab — Basics / More details grouping', () => {
  it('shows the call name without exposing registration identity fields', () => {
    renderBasicInfoTab();

    expect(screen.getByLabelText(/Call Name/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Breed/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Registered Name/)).not.toBeInTheDocument();
  });

  it('keeps advanced fields (weight, height, microchip, notes) collapsed by default', () => {
    renderBasicInfoTab();

    expect(screen.queryByLabelText(/Weight/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Height/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Microchip/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Notes/)).not.toBeInTheDocument();
  });

  it('reveals the advanced fields after expanding "More details"', async () => {
    const user = userEvent.setup();
    renderBasicInfoTab();

    await user.click(screen.getByRole('button', { name: /More details/i }));

    expect(await screen.findByLabelText(/Weight/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Height/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Microchip/)).toBeInTheDocument();
  });

  it('shows date-of-birth format helper text', () => {
    renderBasicInfoTab();

    expect(screen.getByText(/Format: MM\/DD\/YYYY/)).toBeInTheDocument();
  });

  it('does not assert a breed on the base dog form', () => {
    renderBasicInfoTab();

    expect(screen.queryByText(/Mixed Breed/)).not.toBeInTheDocument();
  });
});

describe('DogEditPanel — registrations/health collapsed behind one tab', () => {
  it('exposes only two top-level tabs: Basic Info and More for this dog', () => {
    render(
      <DogEditPanel
        open={true}
        onClose={vi.fn()}
        dogId="dog-1"
        dogName="Rex"
        initialDogData={{}}
        userRole={UserRole.EXHIBITOR}
      />
    );

    expect(screen.getByRole('tab', { name: /Basic Info/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /More for this dog/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Registrations$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Health$/i })).not.toBeInTheDocument();
  });

  it('nests Registrations and Health as an accordion under "More for this dog"', async () => {
    const user = userEvent.setup();
    render(
      <DogEditPanel
        open={true}
        onClose={vi.fn()}
        dogId="dog-1"
        dogName="Rex"
        initialDogData={{}}
        userRole={UserRole.EXHIBITOR}
      />
    );

    await user.click(screen.getByRole('tab', { name: /More for this dog/i }));

    expect(await screen.findByRole('button', { name: /Registrations/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Health/i })).toBeInTheDocument();
  });
});
