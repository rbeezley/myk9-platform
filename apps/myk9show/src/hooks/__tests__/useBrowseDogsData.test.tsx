import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Dog } from '@/types/dog-types';
import { useBrowseDogsData } from '../useBrowseDogsData';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

// The browse filter hooks read their state from the query string
// (MYK9-221, `useUrlFilters`), so they need a router in scope.
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

const state = vi.hoisted(() => ({
  dogs: [] as Dog[],
  isLoading: false,
  error: null as unknown,
  refetch: vi.fn(),
}));

vi.mock('@/hooks/useRoleBasedData', () => ({
  useRoleBasedDogs: () => state.dogs,
}));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    isLoading: state.isLoading,
    error: state.error,
    refetch: state.refetch,
  }),
}));

const dog = (overrides: Partial<Dog> & { id: string }): Dog =>
  ({
    name: overrides.callName ?? overrides.id,
    callName: overrides.id,
    breed: 'Border Collie',
    sex: 'female',
    ownerId: 'owner-1',
    ownerName: 'Jane Doe',
    registrations: [],
    ...overrides,
  }) as Dog;

describe('useBrowseDogsData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.dogs = [];
    state.isLoading = false;
    state.error = null;
  });

  it('sorts alphabetically by display name regardless of input order', () => {
    state.dogs = [dog({ id: 'Willow' }), dog({ id: 'Archie' }), dog({ id: 'Juniper' })];
    const { result } = renderHook(() => useBrowseDogsData(), { wrapper });
    expect(result.current.filteredDogs.map(d => d.callName)).toEqual([
      'Archie',
      'Juniper',
      'Willow',
    ]);
  });

  it('keeps the sort stable while a search narrows the list', () => {
    state.dogs = [dog({ id: 'Willow' }), dog({ id: 'Archie' }), dog({ id: 'Wallace' })];
    const { result } = renderHook(() => useBrowseDogsData(), { wrapper });
    act(() => result.current.setFilters(f => ({ ...f, search: 'wal' })));
    expect(result.current.filteredDogs.map(d => d.callName)).toEqual(['Wallace']);
  });

  it('matches on call name, breed, and owner independently', () => {
    state.dogs = [
      dog({ id: 'Willow', breed: 'Papillon', ownerName: 'Sam Reed' }),
      dog({ id: 'Archie', breed: 'Border Collie', ownerName: 'Jane Doe' }),
    ];
    const { result } = renderHook(() => useBrowseDogsData(), { wrapper });

    act(() => result.current.setFilters(f => ({ ...f, search: 'papillon' })));
    expect(result.current.filteredDogs.map(d => d.callName)).toEqual(['Willow']);

    act(() => result.current.setFilters(f => ({ ...f, search: 'jane' })));
    expect(result.current.filteredDogs.map(d => d.callName)).toEqual(['Archie']);
  });

  it('does not let a query match across two different fields', () => {
    // The search index joins fields on an escaped NUL precisely so that a query
    // spanning a field boundary ("Willow Papillon") cannot produce a false hit.
    state.dogs = [dog({ id: 'Willow', breed: 'Papillon' })];
    const { result } = renderHook(() => useBrowseDogsData(), { wrapper });
    act(() => result.current.setFilters(f => ({ ...f, search: 'willow papillon' })));
    expect(result.current.filteredDogs).toHaveLength(0);
  });

  it('applies breed and sex filters together', () => {
    state.dogs = [
      dog({ id: 'Willow', breed: 'Papillon', sex: 'female' }),
      dog({ id: 'Archie', breed: 'Papillon', sex: 'male' }),
      dog({ id: 'Juniper', breed: 'Border Collie', sex: 'female' }),
    ];
    const { result } = renderHook(() => useBrowseDogsData(), { wrapper });
    act(() => result.current.setFilters(f => ({ ...f, breed: 'Papillon', sex: 'female' })));
    expect(result.current.filteredDogs.map(d => d.callName)).toEqual(['Willow']);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('returns every dog, sorted, when no filter is active', () => {
    state.dogs = [dog({ id: 'Willow' }), dog({ id: 'Archie' })];
    const { result } = renderHook(() => useBrowseDogsData(), { wrapper });
    expect(result.current.filteredDogs).toHaveLength(2);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('derives the available breed list from the roster, sorted and deduplicated', () => {
    state.dogs = [
      dog({ id: 'Willow', breed: 'Papillon' }),
      dog({ id: 'Archie', breed: 'Border Collie' }),
      dog({ id: 'Juniper', breed: 'Papillon' }),
    ];
    const { result } = renderHook(() => useBrowseDogsData(), { wrapper });
    expect(result.current.availableBreeds).toEqual(['Border Collie', 'Papillon']);
  });

  it('clearAllFilters restores the full roster', () => {
    state.dogs = [dog({ id: 'Willow' }), dog({ id: 'Archie' })];
    const { result } = renderHook(() => useBrowseDogsData(), { wrapper });
    act(() => result.current.setFilters(f => ({ ...f, search: 'willow' })));
    expect(result.current.filteredDogs).toHaveLength(1);
    act(() => result.current.clearAllFilters());
    expect(result.current.filteredDogs).toHaveLength(2);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('handleRetry refetches the dog store', () => {
    const { result } = renderHook(() => useBrowseDogsData(), { wrapper });
    act(() => result.current.handleRetry());
    expect(state.refetch).toHaveBeenCalled();
  });
});
