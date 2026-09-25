/**
 * MYK9-709: the placeholder rule itself. The site tests
 * (`showScopedPlaceholder.sites.test.tsx`) prove a show change drops the
 * previous data; these prove the rule still KEEPS it where it always helped
 * (a search term, a filter flag), and leaves a query's own placeholder alone.
 */
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createAppQueryClient } from '@/lib/queryClient';
import { entityIdsInQueryKey, isSameEntityScope } from '@/lib/entityScopedPlaceholder';

const SHOW_A = '0a0a0a0a-0000-4000-8000-00000000000a';
const SHOW_B = '0b0b0b0b-0000-4000-8000-00000000000b';

describe('isSameEntityScope', () => {
  it('finds entity ids at any depth, including nested keys and filter objects', () => {
    expect(entityIdsInQueryKey([['shows', SHOW_B], 'capacity', { showId: SHOW_A }])).toEqual([
      SHOW_A,
      SHOW_B,
    ]);
  });

  it('keeps the scope when only a search term, page or flag changes', () => {
    expect(isSameEntityScope(['entries', SHOW_A, 'dog'], ['entries', SHOW_A, 'doge'])).toBe(true);
    expect(
      isSameEntityScope(
        ['list', { showId: SHOW_A, page: 1 }],
        ['list', { showId: SHOW_A, page: 2 }]
      )
    ).toBe(true);
    expect(isSameEntityScope(['users', 'search', 'ab'], ['users', 'search', 'abc'])).toBe(true);
  });

  it('breaks the scope when an entity id changes, appears or disappears', () => {
    expect(isSameEntityScope(['volunteers', SHOW_A], ['volunteers', SHOW_B])).toBe(false);
    expect(isSameEntityScope(['volunteers', SHOW_A], ['volunteers', ''])).toBe(false);
    expect(isSameEntityScope(['watch', [SHOW_A]], ['watch', [SHOW_A, SHOW_B]])).toBe(false);
  });

  it('compares ids case-insensitively', () => {
    expect(isSameEntityScope(['s', SHOW_A.toUpperCase()], ['s', SHOW_A])).toBe(true);
  });
});

describe('createAppQueryClient placeholder behaviour', () => {
  function wrapperFor() {
    const client = createAppQueryClient();
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  it('keeps the previous rows on screen while the SAME show re-reads for a new search term', async () => {
    let settle!: (rows: string[]) => void;
    const { result, rerender } = renderHook(
      ({ term }) =>
        useQuery({
          queryKey: ['entries', SHOW_A, term],
          queryFn: () =>
            term === 'a' ? Promise.resolve(['row-a']) : new Promise<string[]>(r => (settle = r)),
        }),
      { wrapper: wrapperFor(), initialProps: { term: 'a' } }
    );
    await waitFor(() => expect(result.current.data).toEqual(['row-a']));

    rerender({ term: 'ab' });

    expect(result.current.data).toEqual(['row-a']);
    expect(result.current.isPlaceholderData).toBe(true);
    settle(['row-ab']);
    await waitFor(() => expect(result.current.data).toEqual(['row-ab']));
  });

  it("leaves a query's own placeholderData exactly as written", async () => {
    const { result, rerender } = renderHook(
      ({ showId }) =>
        useQuery({
          queryKey: ['custom', showId],
          queryFn: () =>
            showId === SHOW_A ? Promise.resolve('a') : new Promise<string>(() => undefined),
          placeholderData: previous => previous,
        }),
      { wrapper: wrapperFor(), initialProps: { showId: SHOW_A } }
    );
    await waitFor(() => expect(result.current.data).toBe('a'));

    rerender({ showId: SHOW_B });

    expect(result.current.data).toBe('a');
    expect(result.current.isPlaceholderData).toBe(true);
  });
});
