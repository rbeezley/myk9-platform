import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock supabase — useCurrentUserPerson queries directly
const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });
const mockIsDeletedAt = vi.fn().mockReturnValue({ single: mockSingle });
const mockEqAuthUserId = vi.fn().mockReturnValue({ is: mockIsDeletedAt });
const mockSelect = vi.fn().mockReturnValue({ eq: mockEqAuthUserId });
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({ select: mockSelect }),
  },
}));

vi.mock('@/lib/queryClient', () => ({
  queryKeys: {
    users: {
      all: ['users'],
      detail: (id: string) => ['users', id],
    },
  },
}));

const mockMutateAsync = vi.fn().mockResolvedValue({});
vi.mock('@/hooks/useUsers', () => ({
  useUpdatePerson: () => ({ mutateAsync: mockMutateAsync }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'auth-user-123', email: 'test@example.com' } }),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn() },
  actionNotifications: { updated: vi.fn() },
}));

import { notifications, actionNotifications } from '@/lib/notifications';
import { useProfileForm } from '../useProfileForm';

const dbPersonData = {
  id: 'person-123',
  first_name: 'Jane',
  last_name: 'Doe',
  phone: '555-1234',
  street_address: '123 Main St',
  city: 'Springfield',
  state: 'IL',
  zip_code: '62701',
  email: 'test@example.com',
  auth_user_id: 'auth-user-123',
  profile_image: null,
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

/** Wait for person data to load AND form values to be pre-filled */
async function waitForFormLoaded(result: { current: ReturnType<typeof useProfileForm> }) {
  await waitFor(() => {
    expect(result.current.values.firstName).not.toBe('');
  });
}

describe('useProfileForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({});
    // Default: return person data from supabase
    mockSingle.mockResolvedValue({ data: dbPersonData, error: null });
  });

  it('returns initial empty form values when loading', () => {
    // Simulate loading by returning a pending promise
    mockSingle.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useProfileForm(), { wrapper: createWrapper() });

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

  it('pre-fills form values from person data when loaded', async () => {
    const { result } = renderHook(() => useProfileForm(), { wrapper: createWrapper() });

    await waitForFormLoaded(result);

    expect(result.current.values.firstName).toBe('Jane');
    expect(result.current.values.lastName).toBe('Doe');
    expect(result.current.values.phone).toBe('555-1234');
    expect(result.current.values.streetAddress).toBe('123 Main St');
    expect(result.current.values.city).toBe('Springfield');
    expect(result.current.values.state).toBe('IL');
    expect(result.current.values.zipCode).toBe('62701');
  });

  it('validates required fields (firstName, lastName, streetAddress, city, state, zipCode)', () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const { result } = renderHook(() => useProfileForm(), { wrapper: createWrapper() });

    expect(result.current.errors.firstName).toBe('First name is required');
    expect(result.current.errors.lastName).toBe('Last name is required');
    expect(result.current.errors.streetAddress).toBe('Street address is required');
    expect(result.current.errors.city).toBe('City is required');
    expect(result.current.errors.state).toBe('State is required');
    expect(result.current.errors.zipCode).toBe('Zip code is required');
  });

  it('phone is optional — no validation error when empty', async () => {
    mockSingle.mockResolvedValue({
      data: { ...dbPersonData, phone: '' },
      error: null,
    });

    const { result } = renderHook(() => useProfileForm(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.person).not.toBeNull();
    });

    // Need an extra tick for useEffect to pre-fill form
    await waitFor(() => {
      expect(result.current.isValid).toBe(true);
    });

    expect((result.current.errors as Record<string, string>).phone).toBeUndefined();
  });

  it('isValid is false when required fields are empty', () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const { result } = renderHook(() => useProfileForm(), { wrapper: createWrapper() });

    expect(result.current.isValid).toBe(false);
  });

  it('isValid is true when all required fields are filled', async () => {
    const { result } = renderHook(() => useProfileForm(), { wrapper: createWrapper() });

    await waitForFormLoaded(result);

    expect(result.current.isValid).toBe(true);
  });

  it('isDirty is false when values match person data', async () => {
    const { result } = renderHook(() => useProfileForm(), { wrapper: createWrapper() });

    await waitForFormLoaded(result);

    expect(result.current.isDirty).toBe(false);
  });

  it('isDirty is true when values differ from person data', async () => {
    const { result } = renderHook(() => useProfileForm(), { wrapper: createWrapper() });

    await waitForFormLoaded(result);

    act(() => {
      result.current.setValue('firstName', 'Janet');
    });

    expect(result.current.isDirty).toBe(true);
  });

  it('save() calls updatePerson.mutateAsync with trimmed values', async () => {
    const { result } = renderHook(() => useProfileForm(), { wrapper: createWrapper() });

    await waitForFormLoaded(result);

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
      })
    );
  });

  it('save() shows success notification on success', async () => {
    const { result } = renderHook(() => useProfileForm(), { wrapper: createWrapper() });

    await waitForFormLoaded(result);

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

    const { result } = renderHook(() => useProfileForm(), { wrapper: createWrapper() });

    await waitForFormLoaded(result);

    act(() => {
      result.current.setValue('firstName', 'Janet');
    });

    await act(async () => {
      await result.current.save();
    });

    expect(notifications.error).toHaveBeenCalledWith('Network error');
  });
});
