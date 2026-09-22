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

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: maybeSingleMock })),
      })),
    })),
    storage: { from: vi.fn(() => ({ getPublicUrl: getPublicUrlMock })) },
  },
}));

import { fetchPublishInfo, usePublishInfo } from './usePublishInfo';

describe('usePublishInfo', () => {
  beforeEach(() => {
    mockUseQuery.mockClear();
    maybeSingleMock.mockReset();
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
