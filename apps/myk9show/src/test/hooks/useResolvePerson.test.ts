import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock the userStore
const mockPeople = [
  {
    id: 'person-1',
    firstName: 'Jane',
    lastName: 'Doe',
    profileImage: 'https://example.com/jane.jpg',
    email: 'jane@example.com',
    phone: '555-1234',
  },
  {
    id: 'person-2',
    firstName: 'Bob',
    lastName: 'Smith',
    // no profileImage, email, or phone
  },
];

vi.mock('@/store/userStore', () => ({
  useUserStore: vi.fn(selector => {
    const state = { people: mockPeople };
    return selector ? selector(state) : state;
  }),
}));

import { useResolvePerson } from '@/hooks/useResolvePerson';

describe('useResolvePerson', () => {
  it('resolves a person ID to full person object', () => {
    const { result } = renderHook(() => useResolvePerson());
    const person = result.current('person-1');
    expect(person).toEqual({
      name: 'Jane Doe',
      profileImage: 'https://example.com/jane.jpg',
      email: 'jane@example.com',
      phone: '555-1234',
    });
  });

  it('returns person with undefined optional fields when not present', () => {
    const { result } = renderHook(() => useResolvePerson());
    const person = result.current('person-2');
    expect(person).toEqual({
      name: 'Bob Smith',
      profileImage: undefined,
      email: undefined,
      phone: undefined,
    });
  });

  it('returns fallback with raw ID as name when person not found', () => {
    const { result } = renderHook(() => useResolvePerson());
    const person = result.current('unknown-id');
    expect(person).toEqual({
      name: 'unknown-id',
      profileImage: undefined,
      email: undefined,
      phone: undefined,
    });
  });

  it('returns null for null/undefined input', () => {
    const { result } = renderHook(() => useResolvePerson());
    expect(result.current(null)).toBeNull();
    expect(result.current(undefined)).toBeNull();
  });
});
