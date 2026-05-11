import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePdfCoverImageSrc } from '../coverImageDataUrl';

describe('resolvePdfCoverImageSrc', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns data URLs without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolvePdfCoverImageSrc('data:image/png;base64,abc123')).resolves.toBe(
      'data:image/png;base64,abc123'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when the saved image URL returns an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(resolvePdfCoverImageSrc('https://example.com/missing.webp')).resolves.toBeNull();
  });

  it('returns null when the saved image URL cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failed')));

    await expect(resolvePdfCoverImageSrc('https://example.com/cover.webp')).resolves.toBeNull();
  });
});
