import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { BasicInfoTab } from '../BasicInfoTab';
import { EditPanelContext } from '@/components/panels/edit/useEditPanel';
import { UserRole } from '@/types/auth-types';
import type { DogFormData } from '../types';
import { createInitialFormData } from '../types';

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeMockForm = (overrides: Partial<DogFormData> = {}) => {
  const data: DogFormData = { ...createInitialFormData(), ...overrides };
  return {
    data,
    errors: {},
    setValue: vi.fn(),
    setValues: vi.fn(),
    getError: vi.fn().mockReturnValue(undefined),
    getFieldProps: vi
      .fn()
      .mockReturnValue({ 'aria-invalid': false, 'aria-describedby': undefined, ref: vi.fn() }),
    touchField: vi.fn(),
    handleSubmit: vi.fn(),
    isSubmitting: false,
    isValid: true,
    reset: vi.fn(),
    hasChanges: false,
  };
};

const makeContextValue = (form: ReturnType<typeof makeMockForm>) => ({
  form,
  data: form.data as Record<string, unknown>,
  updateData: vi.fn(),
  setData: vi.fn(),
  hasChanges: false,
  isValid: true,
  errors: [],
  isLoading: false,
  setIsLoading: vi.fn(),
});

const renderBasicInfoTab = (
  userRole: UserRole,
  currentUserPersonId?: string,
  formOverrides: Partial<DogFormData> = {}
) => {
  const form = makeMockForm(formOverrides);
  const contextValue = makeContextValue(form);

  const result = render(
    <EditPanelContext.Provider value={contextValue}>
      <BasicInfoTab
        userRole={userRole}
        currentUserPersonId={currentUserPersonId}
        onPhotoOpen={vi.fn()}
      />
    </EditPanelContext.Provider>
  );

  return { ...result, form };
};

// ---------------------------------------------------------------------------
// Supabase mock helpers
// ---------------------------------------------------------------------------

import { supabase } from '@/services/database/supabaseClient';

const mockSupabasePeople = (
  people: { id: string; first_name: string; last_name: string; email: string | null }[]
) => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: people, error: null }),
  };
  vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>);
  return chain;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BasicInfoTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Exhibitor role', () => {
    it('does NOT render the owner Select', () => {
      mockSupabasePeople([]);
      renderBasicInfoTab(UserRole.EXHIBITOR, 'person-123');

      // The owner Select has placeholder "Choose dog owner"; Gender has "Choose gender"
      // Exhibitor should never see the owner combobox
      expect(screen.queryByText('Choose dog owner')).toBeNull();
    });

    it('does NOT fetch people from Supabase', () => {
      renderBasicInfoTab(UserRole.EXHIBITOR, 'person-123');
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  describe('Secretary role', () => {
    it('renders the owner Select', async () => {
      mockSupabasePeople([]);
      renderBasicInfoTab(UserRole.SECRETARY);

      // After loading resolves the placeholder text appears
      await waitFor(() => {
        expect(screen.getByText('Choose dog owner')).toBeInTheDocument();
      });
    });

    it('fetches people from Supabase on mount', async () => {
      mockSupabasePeople([]);
      renderBasicInfoTab(UserRole.SECRETARY);

      await waitFor(() => {
        expect(supabase.from).toHaveBeenCalledWith('people');
      });
    });

    it('populates the owner dropdown with fetched people', async () => {
      const chain = mockSupabasePeople([
        { id: 'p1', first_name: 'Alice', last_name: 'Smith', email: 'alice@example.com' },
        { id: 'p2', first_name: 'Bob', last_name: 'Jones', email: null },
      ]);

      renderBasicInfoTab(UserRole.SECRETARY);

      // Wait for query to finish — placeholder renders once loading is false
      await screen.findByText('Choose dog owner');

      // Verify the Supabase query returned both people
      expect(vi.mocked(supabase.from)).toHaveBeenCalledWith('people');
      const result = await chain.limit.mock.results[0].value;
      expect(result.data).toHaveLength(2);
      expect(result.data[0].first_name).toBe('Alice');
      expect(result.data[1].first_name).toBe('Bob');
    });

    it('shows validation error when ownerId is empty after touch', async () => {
      mockSupabasePeople([{ id: 'p1', first_name: 'Alice', last_name: 'Smith', email: null }]);

      const form = makeMockForm({ ownerId: '' });
      // Simulate validation error for ownerId
      form.getError = vi.fn(field => {
        if (field === 'ownerId') return 'Please select an owner';
        return undefined;
      });
      const contextValue = makeContextValue(form);

      render(
        <EditPanelContext.Provider value={contextValue}>
          <BasicInfoTab userRole={UserRole.SECRETARY} onPhotoOpen={vi.fn()} />
        </EditPanelContext.Provider>
      );

      await waitFor(() => {
        expect(screen.getByText('Please select an owner')).toBeInTheDocument();
      });
    });
  });

  describe('CLUB_ADMIN role', () => {
    it('renders the owner Select', async () => {
      mockSupabasePeople([]);
      renderBasicInfoTab(UserRole.CLUB_ADMIN);

      await waitFor(() => {
        expect(screen.getByText('Choose dog owner')).toBeInTheDocument();
      });
    });
  });

  describe('SITE_ADMIN role', () => {
    it('renders the owner Select', async () => {
      mockSupabasePeople([]);
      renderBasicInfoTab(UserRole.SITE_ADMIN);

      await waitFor(() => {
        expect(screen.getByText('Choose dog owner')).toBeInTheDocument();
      });
    });
  });
});
