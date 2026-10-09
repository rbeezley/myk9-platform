import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { BasicInfoTab } from '../BasicInfoTab';
import { EditPanelContext } from '@/components/panels/edit/useEditPanel';
import { UserRole } from '@/types/auth-types';
import { createInitialFormData, type DogFormData } from '../types';
import { addDogSchema } from '../validation';

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));

const renderTab = (overrides: Partial<DogFormData>, referenceDate?: string) => {
  const data: DogFormData = { ...createInitialFormData(), ...overrides };
  const form = {
    data,
    errors: {},
    setValue: vi.fn(),
    setValues: vi.fn(),
    getError: vi.fn().mockReturnValue(undefined),
    getFieldProps: vi.fn().mockReturnValue({}),
    touchField: vi.fn(),
    handleSubmit: vi.fn(),
    isSubmitting: false,
    isValid: true,
    reset: vi.fn(),
    hasChanges: false,
  };
  const ctx = {
    form,
    data: data as Record<string, unknown>,
    updateData: vi.fn(),
    setData: vi.fn(),
    hasChanges: false,
    isValid: true,
    errors: [],
    isLoading: false,
    setIsLoading: vi.fn(),
    runSelfNavigation: (navigate: () => void) => navigate(),
  };
  return render(
    <EditPanelContext.Provider value={ctx}>
      <BasicInfoTab
        userRole={UserRole.EXHIBITOR}
        currentUserPersonId="p1"
        onPhotoOpen={vi.fn()}
        onAddRegistration={vi.fn()}
        referenceDate={referenceDate}
      />
    </EditPanelContext.Provider>
  );
};

describe('Add Dog date of birth (MYK9-1060)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts empty: nothing defaults the birthday to today', () => {
    expect(createInitialFormData().dateOfBirth).toBe('');
    renderTab({});
    expect(screen.getByLabelText(/date of birth/i)).toHaveValue('');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('blocks a future date of birth', () => {
    const result = addDogSchema.safeParse({
      ...createInitialFormData(),
      callName: 'Cracker',
      gender: 'Male',
      ownerId: 'p1',
      dateOfBirth: '2026-10-09',
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toContain('Date of birth cannot be in the future');
  });

  it('warns, without blocking, when the dog would be under 6 months on the show date', () => {
    const base = {
      ...createInitialFormData(),
      callName: 'Cracker',
      gender: 'Male' as const,
      ownerId: 'p1',
      dateOfBirth: '2026-10-08',
    };
    renderTab(base, '2026-10-24');
    expect(screen.getByRole('status')).toHaveTextContent(
      "Cracker would be under 6 months on Oct 24, 2026 and can't be entered. Check the date of birth."
    );
    expect(addDogSchema.safeParse(base).success).toBe(true);
  });

  it('shows no warning for an adult dog', () => {
    renderTab({ callName: 'Max', dateOfBirth: '2020-01-01' }, '2026-10-24');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
