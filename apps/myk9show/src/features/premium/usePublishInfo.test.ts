import { describe, expect, it, vi } from 'vitest';

const mockUseQuery = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => {
    mockUseQuery(options);
    return { data: undefined };
  },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));

import { usePublishInfo } from './usePublishInfo';

describe('usePublishInfo', () => {
  it("does not carry another show's publish state across a show navigation", () => {
    usePublishInfo('show-b');

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      placeholderData?: (previous: unknown) => unknown;
    };

    expect(options.placeholderData).toEqual(expect.any(Function));
    expect(options.placeholderData?.({ publishedUrl: 'https://show-a.test/premium.pdf' })).toBe(
      undefined
    );
  });
});
