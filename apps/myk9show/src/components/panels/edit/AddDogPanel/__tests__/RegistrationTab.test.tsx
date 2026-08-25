import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RegistrationTab } from '../RegistrationTab';
import { EditPanelContext } from '@/components/panels/edit/useEditPanel';
import type { DogFormData } from '../types';
import { createInitialFormData } from '../types';

function renderTab(formOverrides: Partial<DogFormData> = {}) {
  const data: DogFormData = { ...createInitialFormData(), ...formOverrides };
  const form = {
    data,
    errors: {},
    setValue: vi.fn(),
    setValues: vi.fn(),
    getError: vi.fn().mockReturnValue(undefined),
    getFieldProps: vi.fn().mockReturnValue({ 'aria-invalid': false, ref: vi.fn() }),
    touchField: vi.fn(),
    handleSubmit: vi.fn(),
    isSubmitting: false,
    isValid: true,
    reset: vi.fn(),
    hasChanges: false,
  };
  return render(
    <EditPanelContext.Provider
      value={{
        form,
        data: data as Record<string, unknown>,
        updateData: vi.fn(),
        setData: vi.fn(),
        hasChanges: false,
        isValid: true,
        errors: [],
        isLoading: false,
        setIsLoading: vi.fn(),
      }}
    >
      <RegistrationTab
        onRemoveRegistration={vi.fn()}
        onEditRegistration={vi.fn()}
        onAddRegistration={vi.fn()}
      />
    </EditPanelContext.Provider>
  );
}

describe('RegistrationTab empty state (4.E — no silent Mixed Breed)', () => {
  it('says a registration will supply the breed later', () => {
    renderTab({ registrations: [] });
    expect(screen.queryByText(/Mixed Breed/)).not.toBeInTheDocument();
    expect(screen.getByText(/breed will be recorded with that organization/i)).toBeInTheDocument();
  });

  it('does not show the fallback note once a registration exists', () => {
    renderTab({
      registrations: [
        {
          id: 'r1',
          organization: 'AKC',
          registeredName: 'Ch. Buddy',
          breed: 'Labrador Retriever',
          registrationNumber: 'SR123',
          status: 'active',
        },
      ] as DogFormData['registrations'],
    });
    expect(screen.queryByText(/saved as/i)).toBeNull();
  });
});
