/**
 * MYK9-570. The exhibitor's own account page round-trips the date of birth and
 * the registry junior handler numbers.
 *
 * Assertion-first on the SAVE PAYLOAD, not on the form state: the values reach
 * the database through one hand-listed object, and a field present in the form
 * but missing from that object looks correct on screen and saves nothing
 * (LESSON last-hop-drop).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
const { mockPrivateRpc } = vi.hoisted(() => ({ mockPrivateRpc: vi.fn() }));
const mockIsDeletedAt = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
const mockEqAuthUserId = vi.fn().mockReturnValue({ is: mockIsDeletedAt });
const mockSelect = vi.fn().mockReturnValue({ eq: mockEqAuthUserId });
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: () => ({ select: mockSelect }) },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: mockPrivateRpc },
}));

vi.mock('@/lib/queryClient', () => ({
  queryKeys: { users: { all: ['users'], detail: (id: string) => ['users', id] } },
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
}));

import { notifications } from '@/lib/notifications';
import { useProfileForm } from '../useProfileForm';

const dbPersonData = {
  id: 'person-123',
  first_name: 'Mariana',
  last_name: 'Rivera',
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

async function loaded() {
  const { result } = renderHook(() => useProfileForm(), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.values.firstName).not.toBe(''));
  return result;
}

describe('useProfileForm junior handler fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({});
    mockMaybeSingle.mockResolvedValue({ data: dbPersonData, error: null });
    mockPrivateRpc.mockResolvedValue({
      data: [
        {
          person_id: 'person-123',
          date_of_birth: '2011-03-04',
          junior_handler_numbers: { AKC: '7654321' },
        },
      ],
      error: null,
    });
  });

  it('pre-fills the date of birth and the AKC number from the person row', async () => {
    const result = await loaded();
    expect(result.current.privateFieldsReady).toBe(true);
    expect(result.current.values.dateOfBirth).toBe('2011-03-04');
    expect(result.current.values.juniorHandlerNumbers).toEqual({ AKC: '7654321' });
    expect(result.current.isDirty).toBe(false);
  });

  it('is dirty when only the junior number changes', async () => {
    const result = await loaded();
    expect(result.current.privateFieldsReady).toBe(true);
    act(() =>
      result.current.setValue('juniorHandlerNumbers', {
        ...result.current.values.juniorHandlerNumbers,
        UKC: 'UKC-42',
      })
    );
    expect(result.current.isDirty).toBe(true);
  });

  it('sends the date of birth and the reassembled number map on save', async () => {
    const result = await loaded();
    act(() => result.current.setValue('dateOfBirth', '2011-03-05'));
    act(() =>
      result.current.setValue('juniorHandlerNumbers', {
        ...result.current.values.juniorHandlerNumbers,
        UKC: '  UKC-42  ',
      })
    );
    await act(async () => {
      await result.current.save();
    });

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        dateOfBirth: '2011-03-05',
        juniorHandlerNumbers: { AKC: '7654321', UKC: 'UKC-42' },
      })
    );
  });

  it('omits a cleared number from the map rather than writing an empty string', async () => {
    const result = await loaded();
    act(() => result.current.setValue('juniorHandlerNumbers', { AKC: '' }));
    await act(async () => {
      await result.current.save();
    });
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ juniorHandlerNumbers: {} })
    );
  });

  it('setValue takes an updater, and stores the result rather than the function', async () => {
    // MYK9-570: the account page's junior-number inputs derive the next map from
    // the current one. Without updater support they store the FUNCTION, and
    // `juniorHandlerNumbersForSave` then reads undefined off it and emits `{}` —
    // every stored registry number wiped, suite green.
    const result = await loaded();

    act(() =>
      result.current.setValue('juniorHandlerNumbers', previous => ({ ...previous, UKC: 'U-1' }))
    );
    act(() =>
      result.current.setValue('juniorHandlerNumbers', previous => ({ ...previous, ASCA: 'A-1' }))
    );

    expect(typeof result.current.values.juniorHandlerNumbers).toBe('object');
    expect(result.current.values.juniorHandlerNumbers).toEqual({
      AKC: '7654321',
      UKC: 'U-1',
      ASCA: 'A-1',
    });

    await act(async () => {
      await result.current.save();
    });
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        juniorHandlerNumbers: { AKC: '7654321', UKC: 'U-1', ASCA: 'A-1' },
      })
    );
  });

  it('refuses a date of birth in the future and does not save', async () => {
    const result = await loaded();
    act(() => result.current.setValue('dateOfBirth', '2999-01-01'));
    expect(result.current.errors.dateOfBirth).toBeTruthy();
    expect(result.current.isValid).toBe(false);
    await act(async () => {
      await result.current.save();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('accepts an empty date of birth — the field is optional', async () => {
    const result = await loaded();
    act(() => result.current.setValue('dateOfBirth', ''));
    expect(result.current.errors.dateOfBirth).toBeUndefined();
    await act(async () => {
      await result.current.save();
    });
    expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ dateOfBirth: '' }));
  });

  it('blocks every save when the private read is incomplete', async () => {
    mockPrivateRpc.mockResolvedValue({ data: null, error: { message: 'network unavailable' } });
    const result = await loaded();
    expect(result.current.privateFieldsReady).toBe(false);

    act(() => result.current.setValue('phone', '555-9999'));
    await act(async () => {
      await result.current.save();
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(result.current.saveError).toBe(
      'Private profile fields are unavailable right now. Please try again before saving.'
    );
    expect(notifications.error).toHaveBeenCalledWith(
      'Private profile fields are unavailable right now. Please try again before saving.'
    );
  });
});
