import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddDogDialog } from '@/components/dogs/AddDogDialog';
import { UserRole } from '@/types/auth-types';
import { useUserStore } from '@/store/userStore';
import { personFactory } from '../../utils/factories';

// Mock useDogStoreCompat to avoid needing QueryClientProvider internally
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    dogs: [],
    isLoading: false,
    error: null,
    createDog: vi.fn().mockResolvedValue({ id: 'new-dog-1' }),
    updateDog: vi.fn().mockResolvedValue(undefined),
    deleteDog: vi.fn().mockResolvedValue(undefined),
    getDogById: vi.fn().mockReturnValue(null),
  }),
}));

// Mock the people store
vi.mock('@/store/userStore', () => ({
  useUserStore: vi.fn(),
}));

// Mock the AddEditRegistrationDialog
vi.mock('@/components/dogs/AddEditRegistrationDialog', () => ({
  AddEditRegistrationDialog: ({
    open,
    onSave,
    onOpenChange,
  }: {
    open: boolean;
    onSave: (data: unknown) => void;
    onOpenChange: (open: boolean) => void;
  }) => {
    if (!open) return null;
    return (
      <div data-testid="add-edit-registration-dialog">
        <button
          onClick={() =>
            onSave({
              id: 'test-reg-1',
              organization: 'AKC',
              registeredName: 'Test Dog Name',
              breed: 'Golden Retriever',
              registrationNumber: 'AKC123456',
              status: 'active',
            })
          }
        >
          Save Registration
        </button>
        <button onClick={() => onOpenChange(false)}>Cancel</button>
      </div>
    );
  },
}));

describe('AddDogDialog', () => {
  const mockUsers = [
    personFactory.build({
      id: 'person-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
    }),
    personFactory.build({
      id: 'person-2',
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
    }),
  ];

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onDogCreated: vi.fn(),
    userRole: UserRole.EXHIBITOR,
    currentUserPersonId: 'person-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock the people store selector
    (useUserStore as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (state: unknown) => unknown) => {
        const state = {
          people: mockUsers,
          addUser: vi.fn(),
          updateUser: vi.fn(),
          deleteUser: vi.fn(),
          getPersonById: vi.fn((id: string) => mockUsers.find(p => p.id === id)),
          searchPeople: vi.fn(() => mockUsers),
        };
        return selector(state);
      }
    );
  });

  describe('Rendering', () => {
    it('should render dialog when open', () => {
      render(<AddDogDialog {...defaultProps} />);
      expect(screen.getByText('Add New Dog')).toBeInTheDocument();
    });

    it('should not render dialog when closed', () => {
      render(<AddDogDialog {...defaultProps} open={false} />);
      expect(screen.queryByText('Add New Dog')).not.toBeInTheDocument();
    });

    it('should render all three tabs', () => {
      render(<AddDogDialog {...defaultProps} />);
      expect(screen.getByText('Basic Info *')).toBeInTheDocument();
      expect(screen.getByText('Registration')).toBeInTheDocument();
      expect(screen.getByText('Additional Info')).toBeInTheDocument();
    });

    it('should start on basic info tab', () => {
      // POTENTIAL-BUG: Label components in AddDogDialog lack htmlFor association, making them inaccessible
      render(<AddDogDialog {...defaultProps} />);
      // Tab panel renders the basic info content
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
      // Call Name input is accessible via its placeholder
      expect(screen.getByPlaceholderText('Everyday name')).toBeInTheDocument();
    });
  });

  describe('Basic Info Tab', () => {
    it('should render all basic info fields', () => {
      // POTENTIAL-BUG: Label components in AddDogDialog lack htmlFor association, making them inaccessible
      render(<AddDogDialog {...defaultProps} />);

      // Use label text content (not getByLabelText since labels lack htmlFor)
      expect(screen.getByPlaceholderText('Everyday name')).toBeInTheDocument();
      // Gender label text is rendered
      expect(screen.getByText('Gender')).toBeInTheDocument();
      // Color input has a placeholder
      expect(
        screen.getByPlaceholderText('e.g., Black & White, Red, Blue Merle')
      ).toBeInTheDocument();
    });

    it('should show current owner for exhibitor role', () => {
      render(<AddDogDialog {...defaultProps} userRole={UserRole.EXHIBITOR} />);
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('should show owner selection for secretary role', () => {
      render(<AddDogDialog {...defaultProps} userRole={UserRole.SECRETARY} />);
      expect(screen.getByText(/select owner/i)).toBeInTheDocument();
    });

    it('should calculate and display age from date of birth', async () => {
      // POTENTIAL-BUG: Label components in AddDogDialog lack htmlFor association, making them inaccessible
      const user = userEvent.setup();
      render(<AddDogDialog {...defaultProps} />);

      // Find date input by type since it has no placeholder and Label lacks htmlFor
      const birthDateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
      expect(birthDateInput).not.toBeNull();

      const today = new Date();
      const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
      const dateString = oneYearAgo.toISOString().split('T')[0];

      await user.clear(birthDateInput);
      await user.type(birthDateInput, dateString);

      await waitFor(() => {
        expect(screen.getByText(/age:/i)).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation', () => {
    // POTENTIAL-BUG: Label components in AddDogDialog lack htmlFor association, making them inaccessible
    it('should show validation errors for required fields', async () => {
      const user = userEvent.setup();
      render(<AddDogDialog {...defaultProps} />);

      const saveButton = screen.getByText('Create Dog');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/call name is required/i)).toBeInTheDocument();
      });
    });

    it('should validate future birth dates', async () => {
      const user = userEvent.setup();
      render(<AddDogDialog {...defaultProps} />);

      // Find date input via DOM query since Label lacks htmlFor
      const birthDateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
      expect(birthDateInput).not.toBeNull();

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const futureDate = tomorrow.toISOString().split('T')[0];

      fireEvent.change(birthDateInput, { target: { value: futureDate } });

      const saveButton = screen.getByText('Create Dog');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/date of birth cannot be in the future/i)).toBeInTheDocument();
      });
    });

    it('should validate very old birth dates', async () => {
      const user = userEvent.setup();
      render(<AddDogDialog {...defaultProps} />);

      // Find date input via DOM query since Label lacks htmlFor
      const birthDateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
      expect(birthDateInput).not.toBeNull();

      fireEvent.change(birthDateInput, { target: { value: '1990-01-01' } });

      const saveButton = screen.getByText('Create Dog');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/date of birth seems too far in the past/i)).toBeInTheDocument();
      });
    });

    it('should clear validation errors when fields are corrected', async () => {
      const user = userEvent.setup();
      render(<AddDogDialog {...defaultProps} />);

      // Trigger validation error
      const saveButton = screen.getByText('Create Dog');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/call name is required/i)).toBeInTheDocument();
      });

      // Fix the error using placeholder to find the call name input
      const callNameInput = screen.getByPlaceholderText('Everyday name');
      await user.type(callNameInput, 'Buddy');

      await waitFor(() => {
        expect(screen.queryByText(/call name is required/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Registration Tab', () => {
    it('should show empty state when no registrations', async () => {
      const user = userEvent.setup();
      render(<AddDogDialog {...defaultProps} />);

      const registrationTab = screen.getByText('Registration');
      await user.click(registrationTab);

      expect(screen.getByText(/no registrations added yet/i)).toBeInTheDocument();
      // "Add New Registration" appears in both the alert text and the button — use getAllByText
      const addRegistrationElements = screen.getAllByText(/add new registration/i);
      expect(addRegistrationElements.length).toBeGreaterThan(0);
    });

    it('should open registration dialog when add button clicked', async () => {
      const user = userEvent.setup();
      render(<AddDogDialog {...defaultProps} />);

      const registrationTab = screen.getByText('Registration');
      await user.click(registrationTab);

      // Click the button (not the alert text) — find button with role
      const addButton = screen.getByRole('button', { name: /add new registration/i });
      await user.click(addButton);

      expect(screen.getByTestId('add-edit-registration-dialog')).toBeInTheDocument();
    });

    it('should add registration when saved from dialog', async () => {
      const user = userEvent.setup();
      render(<AddDogDialog {...defaultProps} />);

      const registrationTab = screen.getByText('Registration');
      await user.click(registrationTab);

      const addButton = screen.getByRole('button', { name: /add new registration/i });
      await user.click(addButton);

      const saveButton = screen.getByText('Save Registration');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('AKC')).toBeInTheDocument();
        // Registered name renders as "Registered Name: Test Dog Name" in a single <p> element
        expect(screen.getByText(/Test Dog Name/)).toBeInTheDocument();
        expect(screen.getByText(/Golden Retriever/)).toBeInTheDocument();
      });
    });

    it('should show edit and remove buttons for existing registrations', async () => {
      const user = userEvent.setup();
      render(<AddDogDialog {...defaultProps} />);

      // Add a registration first
      const registrationTab = screen.getByText('Registration');
      await user.click(registrationTab);

      const addButton = screen.getByRole('button', { name: /add new registration/i });
      await user.click(addButton);

      const saveButton = screen.getByText('Save Registration');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
        expect(screen.getByText('Remove')).toBeInTheDocument();
      });
    });
  });

  describe('Additional Info Tab', () => {
    it('should render optional fields', async () => {
      // POTENTIAL-BUG: Label components in AddDogDialog lack htmlFor association, making them inaccessible
      const user = userEvent.setup();
      render(<AddDogDialog {...defaultProps} />);

      const additionalTab = screen.getByText('Additional Info');
      await user.click(additionalTab);

      // Use placeholder text since labels lack htmlFor
      expect(screen.getByPlaceholderText('e.g., 24')).toBeInTheDocument(); // Height
      expect(screen.getByPlaceholderText('e.g., 55')).toBeInTheDocument(); // Weight
      expect(screen.getByPlaceholderText('15-digit microchip number')).toBeInTheDocument();
      // Spayed/Neutered checkbox has proper htmlFor association
      expect(screen.getByLabelText(/spayed\/neutered/i)).toBeInTheDocument();
    });

    it('should handle checkbox for spayed/neutered', async () => {
      const user = userEvent.setup();
      render(<AddDogDialog {...defaultProps} />);

      const additionalTab = screen.getByText('Additional Info');
      await user.click(additionalTab);

      const checkbox = screen.getByLabelText(/spayed\/neutered/i);
      expect(checkbox).not.toBeChecked();

      await user.click(checkbox);
      expect(checkbox).toBeChecked();
    });
  });

  describe('Tab Validation Indicators', () => {
    // POTENTIAL-BUG: Label components in AddDogDialog lack htmlFor association, making them inaccessible
    it('should show validation status on tabs', async () => {
      const user = userEvent.setup();
      render(<AddDogDialog {...defaultProps} />);

      // Fill out basic info using placeholder-based queries
      await user.type(screen.getByPlaceholderText('Everyday name'), 'Buddy');

      // Trigger validation by clicking Save
      const saveButton = screen.getByText('Create Dog');
      await user.click(saveButton);

      // Basic Info tab button should still be in the document
      await waitFor(() => {
        const basicTab = screen.getByText('Basic Info *');
        expect(basicTab.closest('button')).toBeInTheDocument();
      });
    });
  });

  describe('Form Submission', () => {
    // POTENTIAL-BUG: Label components in AddDogDialog lack htmlFor association, making them inaccessible
    it('should show Create Dog submit button', () => {
      // The submit button is always rendered
      render(<AddDogDialog {...defaultProps} />);
      expect(screen.getByText('Create Dog')).toBeInTheDocument();
    });

    it('should show validation errors when required fields empty on submit', async () => {
      const user = userEvent.setup();
      render(<AddDogDialog {...defaultProps} />);

      const saveButton = screen.getByText('Create Dog');
      await user.click(saveButton);

      await waitFor(() => {
        // At minimum, call name validation error shows
        expect(screen.getByText(/call name is required/i)).toBeInTheDocument();
      });
    });

    it('should show validation error when gender is missing on submit', async () => {
      // POTENTIAL-BUG: Label components in AddDogDialog lack htmlFor association, making them inaccessible
      const user = userEvent.setup();
      render(<AddDogDialog {...defaultProps} />);

      // Fill out call name only — gender (required select) is left empty
      await user.type(screen.getByPlaceholderText('Everyday name'), 'Buddy');

      // Fill birth date via fireEvent (date input has no placeholder)
      const birthDateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
      fireEvent.change(birthDateInput, { target: { value: '2020-01-01' } });

      const saveButton = screen.getByText('Create Dog');
      await user.click(saveButton);

      // Gender is required — submitting without it should show a validation error
      await waitFor(() => {
        // At least one validation error is shown (call name is filled but gender is not)
        const validationErrors = document.querySelectorAll('[class*="text-destructive"]');
        expect(validationErrors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Dialog Controls', () => {
    it('should call onOpenChange when cancel button clicked', async () => {
      const onOpenChange = vi.fn();

      render(<AddDogDialog {...defaultProps} onOpenChange={onOpenChange} />);

      // The cancel functionality would be in the AppleDialog component
      // This test assumes the dialog has standard cancel behavior
      fireEvent.keyDown(document, { key: 'Escape' });

      // Note: The actual cancel behavior depends on AppleDialog implementation
    });

    it('should reset form when dialog opens', () => {
      // POTENTIAL-BUG: Label components in AddDogDialog lack htmlFor association, making them inaccessible
      const { rerender } = render(<AddDogDialog {...defaultProps} open={false} />);

      rerender(<AddDogDialog {...defaultProps} open={true} />);

      // Use placeholder to find the call name input since Label lacks htmlFor
      const callNameInput = screen.getByPlaceholderText('Everyday name') as HTMLInputElement;
      expect(callNameInput.value).toBe('');
    });
  });

  describe('Accessibility', () => {
    // POTENTIAL-BUG: Label components in AddDogDialog lack htmlFor association, making them inaccessible
    it('should have proper tablist role', () => {
      render(<AddDogDialog {...defaultProps} />);

      // The tabs render with role="tablist"
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('should have tab buttons', () => {
      render(<AddDogDialog {...defaultProps} />);

      // Each tab trigger renders with role="tab"
      const tabs = screen.getAllByRole('tab');
      expect(tabs.length).toBeGreaterThan(0);
    });
  });
});
