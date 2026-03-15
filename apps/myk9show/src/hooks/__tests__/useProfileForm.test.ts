import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock dependencies before importing the hook
const mockUseCurrentUserPersonId = vi.fn().mockReturnValue('person-123');
vi.mock('@/hooks/useRoleBasedData', () => ({
  useCurrentUserPersonId: () => mockUseCurrentUserPersonId(),
}));

const mockMutateAsync = vi.fn().mockResolvedValue({});
const mockUseUserQuery = vi.fn().mockReturnValue({ data: null, isLoading: false });
vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useUserQuery: (...args: unknown[]) => mockUseUserQuery(...args),
}));

vi.mock('@/hooks/useUsers', () => ({
  useUpdatePerson: () => ({ mutateAsync: mockMutateAsync }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { email: 'test@example.com' } }),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn() },
  actionNotifications: { updated: vi.fn() },
}));

import { notifications, actionNotifications } from '@/lib/notifications';
import { useProfileForm } from '../useProfileForm';

const personData = {
  id: 'person-123',
  firstName: 'Jane',
  lastName: 'Doe',
  phone: '555-1234',
  streetAddress: '123 Main St',
  city: 'Springfield',
  state: 'IL',
  zipCode: '62701',
};

describe('useProfileForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCurrentUserPersonId.mockReturnValue('person-123');
    mockUseUserQuery.mockReturnValue({ data: null, isLoading: false });
    mockMutateAsync.mockResolvedValue({});
  });

  it('returns initial empty form values when loading', () => {
    mockUseUserQuery.mockReturnValue({ data: null, isLoading: true });

    const { result } = renderHook(() => useProfileForm());

    expect(result.current.values).toEqual({
      firstName: '',
      lastName: '',
      phone: '',
      streetAddress: '',
      city: '',
      state: '',
      zipCode: '',
    });
    expect(result.current.isLoading).toBe(true);
  });

  it('pre-fills form values from person data when loaded', () => {
    mockUseUserQuery.mockReturnValue({ data: personData, isLoading: false });

    const { result } = renderHook(() => useProfileForm());

    expect(result.current.values.firstName).toBe('Jane');
    expect(result.current.values.lastName).toBe('Doe');
    expect(result.current.values.phone).toBe('555-1234');
    expect(result.current.values.streetAddress).toBe('123 Main St');
    expect(result.current.values.city).toBe('Springfield');
    expect(result.current.values.state).toBe('IL');
    expect(result.current.values.zipCode).toBe('62701');
  });

  it('validates required fields (firstName, lastName, streetAddress, city, state, zipCode)', () => {
    mockUseUserQuery.mockReturnValue({ data: null, isLoading: false });

    const { result } = renderHook(() => useProfileForm());

    expect(result.current.errors.firstName).toBe('First name is required');
    expect(result.current.errors.lastName).toBe('Last name is required');
    expect(result.current.errors.streetAddress).toBe('Street address is required');
    expect(result.current.errors.city).toBe('City is required');
    expect(result.current.errors.state).toBe('State is required');
    expect(result.current.errors.zipCode).toBe('Zip code is required');
  });

  it('phone is optional — no validation error when empty', () => {
    mockUseUserQuery.mockReturnValue({
      data: { ...personData, phone: '' },
      isLoading: false,
    });

    const { result } = renderHook(() => useProfileForm());

    // No phone error key should exist
    expect((result.current.errors as Record<string, string>).phone).toBeUndefined();
    expect(result.current.isValid).toBe(true);
  });

  it('isValid is false when required fields are empty', () => {
    mockUseUserQuery.mockReturnValue({ data: null, isLoading: false });

    const { result } = renderHook(() => useProfileForm());

    expect(result.current.isValid).toBe(false);
  });

  it('isValid is true when all required fields are filled', () => {
    mockUseUserQuery.mockReturnValue({ data: personData, isLoading: false });

    const { result } = renderHook(() => useProfileForm());

    expect(result.current.isValid).toBe(true);
  });

  it('isDirty is false when values match person data', () => {
    mockUseUserQuery.mockReturnValue({ data: personData, isLoading: false });

    const { result } = renderHook(() => useProfileForm());

    expect(result.current.isDirty).toBe(false);
  });

  it('isDirty is true when values differ from person data', () => {
    mockUseUserQuery.mockReturnValue({ data: personData, isLoading: false });

    const { result } = renderHook(() => useProfileForm());

    act(() => {
      result.current.setValue('firstName', 'Janet');
    });

    expect(result.current.isDirty).toBe(true);
  });

  it('save() calls updatePerson.mutateAsync with trimmed values', async () => {
    mockUseUserQuery.mockReturnValue({ data: personData, isLoading: false });

    const { result } = renderHook(() => useProfileForm());

    // Make the form dirty so save will proceed
    act(() => {
      result.current.setValue('firstName', '  Jane  ');
    });

    await act(async () => {
      await result.current.save();
    });

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Jane',
        lastName: 'Doe',
        streetAddress: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
      }),
    );
  });

  it('save() shows success notification on success', async () => {
    mockUseUserQuery.mockReturnValue({ data: personData, isLoading: false });

    const { result } = renderHook(() => useProfileForm());

    act(() => {
      result.current.setValue('firstName', 'Janet');
    });

    await act(async () => {
      await result.current.save();
    });

    expect(actionNotifications.updated).toHaveBeenCalledWith('Profile', 'Janet Doe');
  });

  it('save() shows error notification on failure', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Network error'));
    mockUseUserQuery.mockReturnValue({ data: personData, isLoading: false });

    const { result } = renderHook(() => useProfileForm());

    act(() => {
      result.current.setValue('firstName', 'Janet');
    });

    await act(async () => {
      await result.current.save();
    });

    expect(notifications.error).toHaveBeenCalledWith('Network error');
  });
});
