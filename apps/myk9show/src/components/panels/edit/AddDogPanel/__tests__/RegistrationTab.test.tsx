import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { RegistrationTab } from '../RegistrationTab';
import { EditPanelContext } from '@/components/panels/edit/useEditPanel';
import type { DogFormData } from '../types';
import { createInitialFormData } from '../types';
import { REGISTRATION_HEADING_ID } from '../validationTab';

function renderTab(formOverrides: Partial<DogFormData> = {}, onSkip?: () => void) {
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
        runSelfNavigation: (navigate: () => void) => navigate(),
      }}
    >
      <RegistrationTab
        onRemoveRegistration={vi.fn()}
        onEditRegistration={vi.fn()}
        onAddRegistration={vi.fn()}
        onFindDog={vi.fn().mockResolvedValue({ kind: 'free' })}
        onIdentityEdited={vi.fn()}
        onIdentityDraftChange={vi.fn()}
        onSaveRegistration={vi.fn()}
        onRegistrationSaved={vi.fn()}
        onSkip={onSkip}
      />
    </EditPanelContext.Provider>
  );
}

describe('RegistrationTab validation focus target (MYK9-885)', () => {
  it('renders a focusable heading a failed save can move focus to', () => {
    renderTab({ registrations: [] });
    const heading = document.getElementById(REGISTRATION_HEADING_ID);
    expect(heading).not.toBeNull();
    heading!.focus();
    expect(document.activeElement).toBe(heading);
  });
});

// MYK9-1162: with no registration the step is the identity form, not a list.
describe('RegistrationTab empty state', () => {
  it('asks for the registry and number first, with Find dog and no Add New Registration', () => {
    renderTab({ registrations: [] });
    expect(screen.queryByText(/Mixed Breed/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Registration Organization/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Registration Number/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find dog' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Registered Name/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Add New Registration/ })).toBeNull();
  });

  it('offers no skip unless the caller allows it', () => {
    renderTab({ registrations: [] });
    expect(screen.queryByRole('button', { name: /No registration number yet/ })).toBeNull();
  });

  it('offers the skip when the caller allows it, and it calls back', async () => {
    const onSkip = vi.fn();
    renderTab({ registrations: [] }, onSkip);
    await userEvent.click(screen.getByRole('button', { name: /No registration number yet/ }));
    expect(onSkip).toHaveBeenCalledOnce();
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
    expect(screen.queryByRole('button', { name: 'Find dog' })).toBeNull();
    expect(screen.getByRole('button', { name: /Add New Registration/ })).toBeInTheDocument();
  });
});

// MYK9-1081 review (partly closes plan follow-up F7): leaving Edit Registration
// returns focus to the row's Edit button, so the icon-only buttons need names.
describe('RegistrationTab row actions are named', () => {
  it('names Edit and Remove after the registration they act on', () => {
    renderTab({
      registrations: [
        {
          id: 'reg-1',
          organization: 'AKC (American Kennel Club)',
          registeredName: 'Mailbox Special Delivery',
          breed: 'Golden Retriever',
          registrationNumber: 'DN12345601',
          status: 'Active',
        },
      ],
    });
    expect(
      screen.getByRole('button', {
        name: 'Edit AKC (American Kennel Club) registration DN12345601',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Remove AKC (American Kennel Club) registration DN12345601',
      })
    ).toBeInTheDocument();
  });
});
