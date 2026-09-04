import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EditPanelWrapper } from '../EditPanelWrapper';
import { DogEditContext } from '../DogEditPanel';
import { BasicInfoTab, OwnerSelectionField } from '../DogEditPanel.sections';
import type { DogFormData } from '../DogEditPanel.types';
import type { User as PersonType } from '@/types/user-types';

// Mock supabase client
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// Mock LoggingService to avoid env-var errors
vi.mock('@/services/LoggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { supabase } from '@/services/database/supabaseClient';

const defaultFormData: DogFormData = {
  callName: 'Rex',
  breed: 'Labrador Retriever',
  registeredName: 'Rex the Dog',
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

function buildSupabaseMock(people: PersonType[]) {
  const dbRows = people.map(p => ({
    id: p.id,
    first_name: p.firstName,
    last_name: p.lastName,
    email: p.email ?? null,
  }));

  const selectMock = vi.fn().mockReturnThis();
  const orderMock = vi.fn().mockReturnThis();
  const limitMock = vi.fn().mockResolvedValue({ data: dbRows, error: null });

  return {
    from: vi.fn().mockReturnValue({
      select: selectMock,
      order: orderMock,
      limit: limitMock,
    }),
  };
}

describe('OwnerSelectionField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for EXHIBITOR role (isAdmin=false)', () => {
    const fromMock = buildSupabaseMock([]).from;
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(fromMock);

    const { container } = render(
      <DogEditContext.Provider value={{ isAdmin: false, people: [] }}>
        <EditPanelWrapper
          open={true}
          onClose={vi.fn()}
          title="Test"
          initialData={defaultFormData}
          onSave={vi.fn()}
          forceHasChanges
        >
          <OwnerSelectionField />
        </EditPanelWrapper>
      </DogEditContext.Provider>
    );

    expect(container.querySelector('#ownerId')).toBeNull();
  });

  it('renders and shows people when isAdmin=true (covers SECRETARY, CLUB_ADMIN, SITE_ADMIN)', async () => {
    const fromImpl = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          { id: 'p1', first_name: 'Alice', last_name: 'Smith', email: 'alice@example.com' },
          { id: 'p2', first_name: 'Bob', last_name: 'Jones', email: 'bob@example.com' },
        ],
        error: null,
      }),
    });
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(fromImpl);

    render(
      <DogEditContext.Provider value={{ isAdmin: true, people: [] }}>
        <EditPanelWrapper
          open={true}
          onClose={vi.fn()}
          title="Test"
          initialData={defaultFormData}
          onSave={vi.fn()}
          forceHasChanges
        >
          <OwnerSelectionField />
        </EditPanelWrapper>
      </DogEditContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Alice Smith/ })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Bob Jones/ })).toBeInTheDocument();
    });

    expect(fromImpl).toHaveBeenCalledWith('people');
  });

  it('hint text does not say "admin only"', async () => {
    const fromImpl = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(fromImpl);

    render(
      <DogEditContext.Provider value={{ isAdmin: true, people: [] }}>
        <EditPanelWrapper
          open={true}
          onClose={vi.fn()}
          title="Test"
          initialData={defaultFormData}
          onSave={vi.fn()}
          forceHasChanges
        >
          <OwnerSelectionField />
        </EditPanelWrapper>
      </DogEditContext.Provider>
    );

    await waitFor(() => {
      expect(screen.queryByText(/admin only/i)).toBeNull();
    });
  });
});

describe('Edit Dog BasicInfoTab accessible names (MYK9-88)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderTab = (formData: DogFormData = defaultFormData) =>
    render(
      <DogEditContext.Provider value={{ isAdmin: false, people: [] }}>
        <EditPanelWrapper
          open={true}
          onClose={vi.fn()}
          title="Test"
          initialData={formData}
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

  it('gives the gender combobox an accessible name from its visible label', () => {
    renderTab();
    expect(screen.getByRole('combobox', { name: /^Gender/ })).toBeInTheDocument();
  });

  it('keeps the change-photo action named by its visible text', () => {
    renderTab();
    expect(screen.getByRole('button', { name: 'Change Photo' })).toBeInTheDocument();
  });

  // The bare "Remove" label says nothing about what is removed out of context.
  // WCAG 2.5.3 requires the visible text to be part of the accessible name.
  it('names the remove-photo action for what it removes', () => {
    renderTab({ ...defaultFormData, imageUrl: 'https://example.com/dog.jpg' });
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument();
  });
});
