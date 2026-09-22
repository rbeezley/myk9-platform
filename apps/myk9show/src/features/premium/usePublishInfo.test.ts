import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseQuery = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => {
    mockUseQuery(options);
    return { data: undefined };
  },
}));

const maybeSingleMock = vi.hoisted(() => vi.fn());
const getPublicUrlMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() =>
  vi.fn((_columns: string) => ({
    eq: vi.fn(() => ({ maybeSingle: maybeSingleMock })),
  }))
);

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: selectMock,
    })),
    storage: { from: vi.fn(() => ({ getPublicUrl: getPublicUrlMock })) },
  },
}));

import { fetchPublishInfo, usePublishInfo } from './usePublishInfo';

describe('usePublishInfo', () => {
  beforeEach(() => {
    mockUseQuery.mockClear();
    maybeSingleMock.mockReset();
    selectMock.mockClear();
    getPublicUrlMock.mockReset();
  });

  it('derives the public URL from the trusted persisted storage path', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        published_premium_path: 'show-b/artifact-1.pdf',
        published_premium_url: 'https://attacker.example/forged.pdf',
        published_premium_at: '2026-05-09T12:00:00.000Z',
        updated_at: '2026-05-09T12:00:00.000Z',
        experience_is_published: true,
      },
      error: null,
    });
    getPublicUrlMock.mockReturnValue({
      data: { publicUrl: 'https://trusted.example/show-b/artifact-1.pdf' },
    });

    await expect(fetchPublishInfo('show-b')).resolves.toMatchObject({
      publishedPath: 'show-b/artifact-1.pdf',
      publishedUrl: 'https://trusted.example/show-b/artifact-1.pdf',
    });
    expect(getPublicUrlMock).toHaveBeenCalledWith('show-b/artifact-1.pdf');
  });

  it('uses the latest legacy URL after a rollback publish clears the versioned path', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        published_premium_path: null,
        published_premium_url: 'https://legacy.example.test/show-b.pdf',
        published_premium_at: '2026-09-22T21:49:00.000Z',
        updated_at: '2026-09-22T21:49:00.000Z',
        experience_is_published: true,
      },
      error: null,
    });

    await expect(fetchPublishInfo('show-b')).resolves.toMatchObject({
      publishedPath: null,
      publishedUrl: 'https://legacy.example.test/show-b.pdf',
    });
    expect(getPublicUrlMock).not.toHaveBeenCalled();
  });

  it('reads the legacy URL shape when the new publish-path column is not deployed yet', async () => {
    maybeSingleMock
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: 'PGRST204',
          message:
            "Could not find the 'published_premium_path' column of 'shows' in the schema cache",
        },
      })
      .mockResolvedValueOnce({
        data: {
          published_premium_url: 'https://legacy.example.test/show-b.pdf',
          published_premium_at: '2026-09-22T21:49:00.000Z',
          updated_at: '2026-09-22T21:49:00.000Z',
          experience_is_published: true,
        },
        error: null,
      });

    await expect(fetchPublishInfo('show-b')).resolves.toMatchObject({
      publishedPath: null,
      publishedUrl: 'https://legacy.example.test/show-b.pdf',
    });
    expect(selectMock.mock.calls.map(([columns]) => columns)).toEqual([
      'published_premium_path, published_premium_url, published_premium_at, updated_at, experience_is_published',
      'published_premium_url, published_premium_at, updated_at, experience_is_published',
    ]);
  });

  it('does not retry a permission failure with the legacy projection', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'permission denied for table shows' },
    });

    await expect(fetchPublishInfo('show-b')).rejects.toMatchObject({ code: '42501' });
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("does not carry another show's publish state across a show navigation", () => {
    usePublishInfo('show-b', true);

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      placeholderData?: (previous: unknown) => unknown;
    };

    expect(options.placeholderData).toEqual(expect.any(Function));
    expect(options.placeholderData?.({ publishedUrl: 'https://show-a.test/premium.pdf' })).toBe(
      undefined
    );
  });

  it('masks cached publish state until management scope is allowed', () => {
    usePublishInfo('show-b', false);

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      enabled?: boolean;
      select?: (data: unknown) => unknown;
    };
    const cachedInfo = { publishedUrl: 'https://show-a.test/premium.pdf' };

    expect(options.enabled).toBe(false);
    expect(options.select?.(cachedInfo)).toBeUndefined();
  });

  it('restores cached publish state only after management scope resolves', () => {
    usePublishInfo('show-b', true);

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      enabled?: boolean;
      select?: (data: unknown) => unknown;
    };
    const cachedInfo = { publishedUrl: 'https://show-b.test/premium.pdf' };

    expect(options.enabled).toBe(true);
    expect(options.select?.(cachedInfo)).toBe(cachedInfo);
  });
});
