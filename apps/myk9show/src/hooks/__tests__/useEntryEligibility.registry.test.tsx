import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { from: mockFrom } }));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { useEntryEligibility } from '../useEntryEligibility';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

/** A show with one AKC trial and one UKC trial. */
const CLASS_ROWS = [
  {
    id: 'class-akc',
    name: 'Interior Novice A',
    level: 'Novice',
    breed_restrictions: ['Belgian Malinois'],
    height_min: null,
    height_max: null,
    age_min: null,
    age_max: null,
    trial_id: 'trial-akc',
    trials: { registry_id: 'AKC' },
  },
  {
    id: 'class-ukc',
    name: 'Nosework Novice',
    level: 'Novice',
    breed_restrictions: ['Belgian Shepherd Dog'],
    height_min: null,
    height_max: null,
    age_min: null,
    age_max: null,
    trial_id: 'trial-ukc',
    trials: { registry_id: 'UKC' },
  },
];

/**
 * A dog whose PRIMARY (earliest) registration is UKC, with a different breed
 * recorded under AKC. Judging both classes against the primary is the bug.
 */
const DOG_ROWS = [
  {
    id: 'dog-1',
    name: 'Ziva',
    call_name: 'Ziva',
    height: null,
    date_of_birth: null,
    registrations: [
      {
        id: 'reg-ukc',
        created_at: '2024-01-01T00:00:00Z',
        organization: 'UKC (United Kennel Club)',
        registration_number: 'P935-254',
        breed: 'Belgian Shepherd Dog',
      },
      {
        id: 'reg-akc',
        created_at: '2025-01-01T00:00:00Z',
        organization: 'AKC (American Kennel Club)',
        registration_number: 'DN61191906',
        breed: 'Belgian Malinois',
      },
    ],
  },
];

function stubTables(dogRows: unknown[] = DOG_ROWS) {
  mockFrom.mockImplementation((table: string) => ({
    select: () => ({
      in: () =>
        Promise.resolve({
          data: table === 'classes' ? CLASS_ROWS : dogRows,
          error: null,
        }),
    }),
  }));
}

// MYK9-90 review round 2, finding 4. Eligibility is a gate on whether someone
// can enter a show, so it must be judged against each CLASS's registry — not
// against whichever registration happens to be the dog's primary.
describe('useEntryEligibility — per-class registry scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubTables();
  });

  it('judges each class against its own trial registry, not the primary registration', async () => {
    const { result } = renderHook(
      () =>
        useEntryEligibility({
          showId: 'show-1',
          dogIds: ['dog-1'],
          classIds: ['class-akc', 'class-ukc'],
        }),
      { wrapper: makeWrapper() }
    );

    await waitFor(() => expect(result.current.eligibility.size).toBe(2));

    // AKC class restricted to Belgian Malinois — the dog's AKC breed. Eligible.
    // Under the old primary-only resolution this saw the UKC breed and rejected.
    expect(result.current.checkEligibility('dog-1', 'class-akc')?.isEligible).toBe(true);

    // UKC class restricted to Belgian Shepherd Dog — the dog's UKC breed. Eligible.
    expect(result.current.checkEligibility('dog-1', 'class-ukc')?.isEligible).toBe(true);
  });

  it('rejects when the breed recorded with THAT registry does not match', async () => {
    // Same dog, but its AKC registration records a different breed.
    stubTables([
      {
        ...DOG_ROWS[0],
        registrations: [
          {
            id: 'reg-akc',
            created_at: '2024-01-01T00:00:00Z',
            organization: 'AKC',
            registration_number: 'DN61191906',
            breed: 'Golden Retriever',
          },
        ],
      },
    ]);

    const { result } = renderHook(
      () =>
        useEntryEligibility({
          showId: 'show-1',
          dogIds: ['dog-1'],
          classIds: ['class-akc', 'class-ukc'],
        }),
      { wrapper: makeWrapper() }
    );

    await waitFor(() => expect(result.current.eligibility.size).toBe(2));

    const akc = result.current.checkEligibility('dog-1', 'class-akc');
    expect(akc?.isEligible).toBe(false);
    expect(akc?.reasons.map(r => r.code)).toContain('BREED_RESTRICTED');

    // The UKC class must NOT borrow the AKC breed to pass its own restriction.
    const ukc = result.current.checkEligibility('dog-1', 'class-ukc');
    expect(ukc?.isEligible).toBe(false);
    expect(ukc?.reasons.map(r => r.code)).toContain('BREED_RESTRICTED');
  });

  it('does not let another registry silence the missing-registration warning', async () => {
    // UKC-only dog. The AKC class must still warn that it has no AKC number.
    stubTables([
      {
        ...DOG_ROWS[0],
        registrations: [
          {
            id: 'reg-ukc',
            created_at: '2024-01-01T00:00:00Z',
            organization: 'UKC',
            registration_number: 'P935-254',
            breed: 'Belgian Shepherd Dog',
          },
        ],
      },
    ]);

    const { result } = renderHook(
      () =>
        useEntryEligibility({
          showId: 'show-1',
          dogIds: ['dog-1'],
          classIds: ['class-akc', 'class-ukc'],
        }),
      { wrapper: makeWrapper() }
    );

    await waitFor(() => expect(result.current.eligibility.size).toBe(2));

    expect(
      result.current.checkEligibility('dog-1', 'class-akc')?.warnings.map(w => w.code)
    ).toContain('MISSING_REGISTRATION_NUMBER');

    // The UKC class has the number, so no warning there.
    expect(
      result.current.checkEligibility('dog-1', 'class-ukc')?.warnings.map(w => w.code)
    ).not.toContain('MISSING_REGISTRATION_NUMBER');
  });
});
