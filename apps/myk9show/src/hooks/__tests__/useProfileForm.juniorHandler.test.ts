/**
 * MYK9-570. The exhibitor's own account page round-trips the date of birth and
 * the registry junior handler numbers. MYK9-664 moved both to `people_private`,
 * which the person (and only they, besides site admins) can read, so the page
 * loads them from there and saves them as a patch in which a blank clears.
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
const mockIsDeletedAt = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
const mockEqAuthUserId = vi.fn().mockReturnValue({ is: mockIsDeletedAt });
const mockSelect = vi.fn().mockReturnValue({ eq: mockEqAuthUserId });
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: () => ({ select: mockSelect }) },
}));

const mockLoadPrivate = vi.fn();
vi.mock('@/services/database/users/personPrivate', () => ({
  loadPersonPrivateDetails: (ids: string[]) => mockLoadPrivate(ids),
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

const ownPrivate = new Map([
  ['person-123', { dateOfBirth: '2011-03-04', juniorHandlerNumbers: { AKC: '7654321' } }],
]);

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
    mockLoadPrivate.mockResolvedValue(ownPrivate);
  });

  it('never asks people for the columns MYK9-664 moved off it', async () => {
    await loaded();
    const columns = String(mockSelect.mock.calls[0]?.[0]);
    expect(columns).not.toContain('date_of_birth');
    expect(columns).not.toContain('junior_handler_numbers');
    expect(mockLoadPrivate).toHaveBeenCalledWith(['person-123']);
  });

  it("pre-fills the date of birth and the AKC number from the person's own private row", async () => {
    const result = await loaded();
    expect(result.current.values.dateOfBirth).toBe('2011-03-04');
    expect(result.current.values.juniorHandlerNumbers).toEqual({ AKC: '7654321' });
    expect(result.current.isDirty).toBe(false);
  });

  it('is dirty when only the junior number changes', async () => {
    const result = await loaded();
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
        // Every registry key: the person sees what is stored, so a blank clears.
        juniorHandlerNumbers: { AKC: '7654321', UKC: 'UKC-42', ASCA: '' },
      })
    );
  });

  it('sends a cleared number as a blank, which the merge patch removes', async () => {
    const result = await loaded();
    act(() => result.current.setValue('juniorHandlerNumbers', { AKC: '' }));
    await act(async () => {
      await result.current.save();
    });
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ juniorHandlerNumbers: { AKC: '', UKC: '', ASCA: '' } })
    );
  });

  it('when the private read failed, a save sends no blanks that would clear stored values', async () => {
    mockLoadPrivate.mockRejectedValue(new Error('offline'));
    const result = await loaded();
    expect(result.current.values.dateOfBirth).toBe('');
    act(() => result.current.setValue('phone', '555-9999'));
    await act(async () => {
      await result.current.save();
    });
    const payload = mockMutateAsync.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.dateOfBirth).toBeUndefined();
    expect(payload.juniorHandlerNumbers).toBeUndefined();
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
});
