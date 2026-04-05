import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useShowOfficials } from '../useShowOfficials';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// Use vi.hoisted so mock functions are available inside vi.mock factory.
// The hook makes two sequential queries:
//   1. from('roles').select('id, name').in('name', [...])
//   2. from('user_roles').select(...).eq('show_id', ...).eq('is_active', true).in('role_id', [...])
const { mockRolesSelect, mockUserRolesSelect } = vi.hoisted(() => ({
  mockRolesSelect: vi.fn(),
  mockUserRolesSelect: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: table === 'roles' ? mockRolesSelect : mockUserRolesSelect,
    })),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

// Canonical role ids used across tests (must be consistent with roles mock data)
const ROLE_IDS = { secretary: 'r1', chairman: 'r2', steward: 'r3' };
const ROLES_DATA = [
  { id: ROLE_IDS.secretary, name: 'secretary' },
  { id: ROLE_IDS.chairman, name: 'chairman' },
  { id: ROLE_IDS.steward, name: 'steward' },
];

function setupRolesMock() {
  mockRolesSelect.mockReturnValue({
    in: vi.fn().mockResolvedValue({ data: ROLES_DATA, error: null }),
  });
}

describe('useShowOfficials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty arrays when no officials assigned', async () => {
    setupRolesMock();
    mockUserRolesSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useShowOfficials('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.secretaries).toEqual([]);
    expect(result.current.data?.chairmen).toEqual([]);
    expect(result.current.data?.stewards).toEqual([]);
  });

  it('is disabled when showId is undefined', () => {
    const { result } = renderHook(() => useShowOfficials(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });

  it('groups officials by role', async () => {
    const mockData = [
      {
        role_id: ROLE_IDS.secretary,
        show_id: 'show-1',
        people: { id: 'p1', first_name: 'Jane', last_name: 'Doe', email: 'jane@test.com' },
      },
      {
        role_id: ROLE_IDS.chairman,
        show_id: 'show-1',
        people: { id: 'p2', first_name: 'John', last_name: 'Smith', email: 'john@test.com' },
      },
      {
        role_id: ROLE_IDS.steward,
        show_id: 'show-1',
        people: { id: 'p3', first_name: 'Bob', last_name: 'Lee', email: null },
      },
    ];

    setupRolesMock();
    mockUserRolesSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: mockData, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useShowOfficials('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.secretaries).toHaveLength(1);
    expect(result.current.data?.secretaries[0]).toEqual({
      personId: 'p1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@test.com',
      role: 'secretary',
    });
    expect(result.current.data?.chairmen).toHaveLength(1);
    expect(result.current.data?.chairmen[0].personId).toBe('p2');
    expect(result.current.data?.stewards).toHaveLength(1);
    expect(result.current.data?.stewards[0].personId).toBe('p3');
  });
});
