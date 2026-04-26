import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock profile form hook
const mockFormReturn = {
  values: {
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '555-1234',
    streetAddress: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    zipCode: '62701',
  },
  setValue: vi.fn(),
  errors: {},
  isValid: true,
  isDirty: false,
  saving: false,
  save: vi.fn(),
  reset: vi.fn(),
  isLoading: false,
  person: {
    id: 'person-1',
    firstName: 'Jane',
    lastName: 'Doe',
    profileImage: null,
  },
  personId: 'person-1',
  email: 'jane@example.com',
};

const mockUseProfileForm = vi.fn(() => ({ ...mockFormReturn }));

vi.mock('@/hooks/useProfileForm', () => ({
  useProfileForm: () => mockUseProfileForm(),
}));

vi.mock('@/hooks/useAvatarUpload', () => ({
  useAvatarUpload: () => ({
    upload: vi.fn(),
    uploading: false,
  }),
}));

vi.mock('@/hooks/useUsers', () => ({
  useUpdatePerson: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn() },
  actionNotifications: { updated: vi.fn() },
}));

import ProfilePage from '../ProfilePage';

function renderPage() {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>
  );
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProfileForm.mockReturnValue({ ...mockFormReturn });
  });

  it('renders loading state when isLoading is true', () => {
    mockUseProfileForm.mockReturnValue({ ...mockFormReturn, isLoading: true, person: null });

    renderPage();

    // The Loader2 spinner has animate-spin class
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('renders error state when no person record found', () => {
    mockUseProfileForm.mockReturnValue({ ...mockFormReturn, isLoading: false, person: null });

    renderPage();

    expect(screen.getByText('Unable to load your profile.')).toBeInTheDocument();
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
  });

  it('renders all form cards (Profile Photo, Personal Information, Address)', () => {
    renderPage();

    expect(screen.getByText('Profile Photo')).toBeInTheDocument();
    expect(screen.getByText('Personal Information')).toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();
  });

  it('renders email as disabled input', () => {
    renderPage();

    const emailInput = screen.getByLabelText('Email');
    expect(emailInput).toBeDisabled();
    expect(emailInput).toHaveValue('jane@example.com');
  });

  it('"Need to change your password?" link points to /account', () => {
    renderPage();

    const link = screen.getByText('Need to change your password?');
    expect(link.closest('a')).toHaveAttribute('href', '/account');
  });

  it('save button is disabled when form is not dirty', () => {
    mockUseProfileForm.mockReturnValue({ ...mockFormReturn, isDirty: false, isValid: true });

    renderPage();

    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    expect(saveButton).toBeDisabled();
  });

  it('save button is disabled when form is not valid', () => {
    mockUseProfileForm.mockReturnValue({ ...mockFormReturn, isDirty: true, isValid: false });

    renderPage();

    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    expect(saveButton).toBeDisabled();
  });

  it('renders Cancel button next to Save button', () => {
    mockUseProfileForm.mockReturnValue({ ...mockFormReturn, isDirty: true, isValid: true });

    renderPage();

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelButton).toBeInTheDocument();
    expect(cancelButton).not.toBeDisabled();
  });

  it('cancel button is disabled when form is not dirty', () => {
    mockUseProfileForm.mockReturnValue({ ...mockFormReturn, isDirty: false, isValid: true });

    renderPage();

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelButton).toBeDisabled();
  });

  it('cancel button is disabled while saving', () => {
    mockUseProfileForm.mockReturnValue({ ...mockFormReturn, isDirty: true, saving: true });

    renderPage();

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelButton).toBeDisabled();
  });

  it('calls form.reset() when Cancel button is clicked', () => {
    const resetFn = vi.fn();
    mockUseProfileForm.mockReturnValue({
      ...mockFormReturn,
      isDirty: true,
      saving: false,
      reset: resetFn,
    });

    renderPage();

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);

    expect(resetFn).toHaveBeenCalledOnce();
  });

  it('cancel button has outline variant', () => {
    mockUseProfileForm.mockReturnValue({ ...mockFormReturn, isDirty: true, isValid: true });

    renderPage();

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    // shadcn Button with variant="outline" adds border and secondary colors
    expect(cancelButton).toHaveClass('border', 'bg-secondary');
  });
});
