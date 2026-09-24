import { describe, expect, it, vi } from 'vitest';
import {
  createPremiumDownload,
  preventPremiumDownloadResponseCaching,
  requestPremiumDownload,
  type PremiumDownloadRow,
} from './premiumDownload.ts';

const showId = '00000000-0000-0000-0000-000000694011';
const artifactId = '11111111-1111-1111-1111-111111111111';
const legacyUrl = `https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/${showId}.pdf`;

describe('preventPremiumDownloadResponseCaching', () => {
  it('marks signed-URL responses as private and non-cacheable', () => {
    const response = preventPremiumDownloadResponseCaching(
      new Response(JSON.stringify({ url: 'https://signed.example/pdf' }), { status: 200 })
    );

    expect(response.headers.get('Cache-Control')).toBe('no-store, private');
    expect(response.status).toBe(200);
  });
});

function row(overrides: Record<string, unknown> = {}): PremiumDownloadRow {
  return {
    id: showId,
    status: 'published',
    deleted_at: null,
    published_premium_path: `${showId}/${artifactId}.pdf`,
    published_premium_url: legacyUrl,
    ...overrides,
  } as PremiumDownloadRow;
}

function backend(record: PremiumDownloadRow | null = row()) {
  return {
    readVersioned: vi.fn(
      async (): Promise<{ data: PremiumDownloadRow | null; error: unknown | null }> => ({
        data: record,
        error: null,
      })
    ),
    readLegacy: vi.fn(
      async (): Promise<{ data: PremiumDownloadRow | null; error: unknown | null }> => ({
        data: record,
        error: null,
      })
    ),
    canPreview: vi.fn(async (_showId: string, _token: string) => false),
    sign: vi.fn(async (path: string, ttl: number) => ({
      data: { signedUrl: `https://signed.example/${path}?expires=${ttl}` },
      error: null,
    })),
  };
}

describe('createPremiumDownload', () => {
  it('signs only the versioned path committed for the requested public show', async () => {
    const storage = backend();

    const result = await createPremiumDownload(showId, storage);

    expect(result).toBe(`https://signed.example/${showId}/${artifactId}.pdf?expires=120`);
    expect(storage.sign).toHaveBeenCalledWith(`${showId}/${artifactId}.pdf`, 120);
    expect(storage.readVersioned).toHaveBeenCalledWith(showId);
  });

  it.each(['published', 'upcoming', 'in_progress', 'completed'])(
    'allows anonymous download for public status %s',
    async status => {
      const storage = backend(
        row({ status, published_premium_path: null, published_premium_url: legacyUrl })
      );

      await expect(createPremiumDownload(showId, storage)).resolves.toContain(`${showId}.pdf`);
      expect(storage.sign).toHaveBeenCalledWith(`${showId}.pdf`, 120);
    }
  );

  it.each([
    ['draft', row({ status: 'draft' })],
    ['soft-deleted', row({ deleted_at: '2026-09-21T12:00:00Z' })],
    ['unlisted status', row({ status: 'cancelled' })],
    ['row for another show', row({ id: '00000000-0000-0000-0000-000000694012' })],
    ['malformed path', row({ published_premium_path: `${showId}/${artifactId}-other.pdf` })],
    [
      'untrusted legacy URL',
      row({
        published_premium_path: null,
        published_premium_url: `https://evil.example/${showId}.pdf`,
      }),
    ],
    [
      'missing committed pointer',
      row({ published_premium_path: null, published_premium_url: null }),
    ],
  ])('does not sign a %s premium', async (_caseName, record) => {
    const storage = backend(record);

    await expect(createPremiumDownload(showId, storage)).resolves.toBeNull();
    expect(storage.sign).not.toHaveBeenCalled();
  });

  it('supports the pre-migration schema using published_premium_url only', async () => {
    const storage = backend(
      row({ published_premium_path: null, published_premium_url: legacyUrl })
    );
    storage.readVersioned.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST204',
        message:
          "Could not find the 'published_premium_path' column of 'shows' in the schema cache",
      },
    });

    await expect(createPremiumDownload(showId, storage)).resolves.toContain(`${showId}.pdf`);
    expect(storage.readLegacy).toHaveBeenCalledWith(showId);
    expect(storage.sign).toHaveBeenCalledWith(`${showId}.pdf`, 120);
  });

  it.each(['PGRST204', '42703'])(
    'supports pre-migration fallback for exact missing-column error %s',
    async code => {
      const storage = backend(row({ published_premium_path: undefined }));
      storage.readVersioned.mockResolvedValueOnce({
        data: null,
        error: {
          code,
          message:
            code === 'PGRST204'
              ? "Could not find the 'published_premium_path' column of 'shows' in the schema cache"
              : 'column shows.published_premium_path does not exist',
        },
      });

      await expect(createPremiumDownload(showId, storage)).resolves.toContain(`${showId}.pdf`);
      expect(storage.readLegacy).toHaveBeenCalledWith(showId);
    }
  );

  it('allows an authorized manager to preview a committed draft only after RBAC check', async () => {
    const draft = backend(row({ status: 'draft' }));
    draft.canPreview.mockResolvedValueOnce(true);

    await expect(createPremiumDownload(showId, draft, 'validated-manager-jwt')).resolves.toContain(
      `${showId}/${artifactId}.pdf`
    );
    expect(draft.canPreview).toHaveBeenCalledWith(showId, 'validated-manager-jwt');
    expect(draft.sign).toHaveBeenCalledWith(`${showId}/${artifactId}.pdf`, 120);
  });

  it.each([
    ['anonymous caller', undefined],
    ['invalid bearer', 'invalid-jwt'],
    ['unrelated manager', 'valid-unrelated-manager-jwt'],
  ])('does not sign a draft for an unauthorized %s', async (_name, token) => {
    const draft = backend(row({ status: 'draft' }));

    await expect(createPremiumDownload(showId, draft, token)).resolves.toBeNull();
    expect(draft.sign).not.toHaveBeenCalled();
  });

  it('does not let even an authorized manager download a soft-deleted show', async () => {
    const deleted = backend(row({ deleted_at: '2026-09-21T12:00:00Z' }));
    deleted.canPreview.mockResolvedValueOnce(true);

    await expect(
      createPremiumDownload(showId, deleted, 'validated-manager-jwt')
    ).resolves.toBeNull();
    expect(deleted.canPreview).not.toHaveBeenCalled();
    expect(deleted.sign).not.toHaveBeenCalled();
  });

  it('supports the post-migration schema and prefers the committed versioned path', async () => {
    const storage = backend(row());

    await expect(createPremiumDownload(showId, storage)).resolves.toContain(
      `${showId}/${artifactId}.pdf`
    );
    expect(storage.readLegacy).not.toHaveBeenCalled();
    expect(storage.sign).toHaveBeenCalledWith(`${showId}/${artifactId}.pdf`, 120);
  });

  it('does not disguise unrelated show lookup errors as legacy schema', async () => {
    const storage = backend();
    storage.readVersioned.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'denied' },
    });

    await expect(createPremiumDownload(showId, storage)).rejects.toMatchObject({ code: '42501' });
    expect(storage.readLegacy).not.toHaveBeenCalled();
    expect(storage.sign).not.toHaveBeenCalled();
  });

  it('does not let a caller-selected path override the database pointer', async () => {
    const storage = backend();

    await createPremiumDownload(showId, storage);

    expect(storage.sign).toHaveBeenCalledWith(`${showId}/${artifactId}.pdf`, 120);
    expect(storage.sign).not.toHaveBeenCalledWith(
      `00000000-0000-0000-0000-000000694012/${artifactId}.pdf`,
      120
    );
  });

  it('accepts only a show id and ignores any caller-supplied path', async () => {
    const storage = backend();

    await expect(
      requestPremiumDownload(
        { show_id: showId, path: `00000000-0000-0000-0000-000000694012/${artifactId}.pdf` },
        storage
      )
    ).resolves.toBe(`https://signed.example/${showId}/${artifactId}.pdf?expires=120`);
    expect(storage.sign).toHaveBeenCalledWith(`${showId}/${artifactId}.pdf`, 120);
  });

  it('does not query storage for a malformed request body', async () => {
    const storage = backend();

    await expect(requestPremiumDownload({ show_id: 42 }, storage)).resolves.toBeNull();
    expect(storage.readVersioned).not.toHaveBeenCalled();
    expect(storage.sign).not.toHaveBeenCalled();
  });
});
