import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useEntryFormData } from '../useEntryFormData';
import {
  resolveDogIdentityForOrganization,
  type DogRegistrationLike,
} from '@/features/dogs/identity';

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    // SA-006: secretary now resolved via the get_show_officials RPC
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const akcRegistration: DogRegistrationLike = {
  id: 'reg-akc',
  created_at: '2024-01-02T00:00:00Z',
  organization: 'AKC',
  registered_name: 'AKC Dog',
  registration_number: 'AKC123',
  breed: 'Belgian Malinois',
  variety: null,
};

const ukcRegistration: DogRegistrationLike = {
  id: 'reg-ukc',
  created_at: '2024-01-01T00:00:00Z',
  organization: 'UKC (United Kennel Club)',
  registered_name: 'UKC Dog',
  registration_number: 'UKC123',
  breed: 'Belgian Shepherd Dog',
  variety: null,
};

describe('useEntryFormData', () => {
  it('returns isLoading true when showId is provided', () => {
    const { result } = renderHook(() => useEntryFormData({ showId: 'show-1' }), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
  });

  it('does not fetch when showId is empty', () => {
    const { result } = renderHook(() => useEntryFormData({ showId: '' }), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.dogs).toEqual([]);
  });
});

// MYK9-90 task 2.3: `useEntryFormData` feeds the AKC scent work entry/transfer
// forms and the UKC nosework entry/change forms. Its registration selection used
// to be `chooseEntryFormRegistration`, which compared organizations with a bare
// `trim().toUpperCase()` and, failing to match, fell back to whichever row it
// already held. Two consequences it is now free of, asserted here because both
// reach printed paperwork.
describe('entry-form registration selection (organization-scoped)', () => {
  const registrations = [ukcRegistration, akcRegistration];

  it('picks the registration for the requested organization', () => {
    expect(resolveDogIdentityForOrganization(registrations, 'AKC').registrationNumber).toBe(
      'AKC123'
    );
    expect(resolveDogIdentityForOrganization(registrations, 'UKC').registrationNumber).toBe(
      'UKC123'
    );
  });

  it('matches organizations whose stored value carries a parenthetical', () => {
    // The live database holds `UKC (United Kennel Club)`. The old comparison
    // never matched it, so a UKC form fell through to the AKC row.
    const identity = resolveDogIdentityForOrganization(registrations, 'UKC');
    expect(identity.breed).toBe('Belgian Shepherd Dog');
    expect(identity.registeredName).toBe('UKC Dog');
  });

  it('never borrows another organization ‑ a blank beats a wrong claim', () => {
    // A UKC-only dog asked for AKC contributes nothing to the AKC form.
    const identity = resolveDogIdentityForOrganization([ukcRegistration], 'AKC');
    expect(identity.registrationNumber).toBeNull();
    expect(identity.registeredName).toBeNull();
    expect(identity.breed).toBeNull();
  });

  it('gives an unregistered dog no breed rather than a guess', () => {
    expect(resolveDogIdentityForOrganization([], 'AKC').breed).toBeNull();
  });
});
