/**
 * Tests for branding upload functions in imageUploadService.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadClubCover, uploadShowCover, uploadShowLogo } from '../imageUploadService';

// Use vi.hoisted so these refs are available inside vi.mock factory (which is hoisted)
const { mockUpload, mockGetPublicUrl, mockFrom } = vi.hoisted(() => {
  const mockUpload = vi.fn();
  const mockGetPublicUrl = vi.fn();
  const mockFrom = vi.fn(() => ({
    upload: mockUpload,
    getPublicUrl: mockGetPublicUrl,
  }));
  return { mockUpload, mockGetPublicUrl, mockFrom };
});

// Mock the supabase client at the path used by the service
vi.mock('../database/supabaseClient', () => ({
  supabase: {
    storage: {
      from: mockFrom,
    },
  },
}));

// Mock logger to avoid noise
vi.mock('../LoggingService', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

function makeFile(name: string, type: string, sizeBytes: number): File {
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type });
}

describe('uploadClubCover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: {
        publicUrl:
          'https://example.supabase.co/storage/v1/object/public/images/clubs/club-1/cover.webp',
      },
    });
  });

  it('uploads to clubs/{clubId}/cover.webp with upsert', async () => {
    const file = makeFile('cover.webp', 'image/webp', 1024);
    const result = await uploadClubCover('club-1', file);

    expect(mockFrom).toHaveBeenCalledWith('images');
    expect(mockUpload).toHaveBeenCalledWith(
      'clubs/club-1/cover.webp',
      file,
      expect.objectContaining({ upsert: true })
    );
    expect(result.success).toBe(true);
    expect(result.url).toContain('clubs/club-1/cover.webp');
  });

  it('rejects files over 5MB', async () => {
    const file = makeFile('big.jpg', 'image/jpeg', 6 * 1024 * 1024);
    const result = await uploadClubCover('club-1', file);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/too large/i);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('rejects non-image files', async () => {
    const file = makeFile('data.pdf', 'application/pdf', 1024);
    const result = await uploadClubCover('club-1', file);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid file type/i);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('returns error when upload fails', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'Storage quota exceeded' } });
    const file = makeFile('cover.png', 'image/png', 1024);
    const result = await uploadClubCover('club-1', file);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Storage quota exceeded');
  });
});

describe('uploadShowCover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: {
        publicUrl:
          'https://example.supabase.co/storage/v1/object/public/images/shows/show-42/cover.webp',
      },
    });
  });

  it('uploads to shows/{showId}/cover.webp with upsert', async () => {
    const file = makeFile('cover.jpg', 'image/jpeg', 2048);
    const result = await uploadShowCover('show-42', file);

    expect(mockFrom).toHaveBeenCalledWith('images');
    expect(mockUpload).toHaveBeenCalledWith(
      'shows/show-42/cover.webp',
      file,
      expect.objectContaining({ upsert: true })
    );
    expect(result.success).toBe(true);
    expect(result.url).toContain('shows/show-42/cover.webp');
  });

  it('rejects files over 5MB', async () => {
    const file = makeFile('big.png', 'image/png', 6 * 1024 * 1024);
    const result = await uploadShowCover('show-42', file);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/too large/i);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('rejects non-image files', async () => {
    const file = makeFile('script.js', 'text/javascript', 512);
    const result = await uploadShowCover('show-42', file);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid file type/i);
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

describe('uploadShowLogo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: {
        publicUrl:
          'https://example.supabase.co/storage/v1/object/public/images/shows/show-42/logo.webp',
      },
    });
  });

  it('uploads to shows/{showId}/logo.webp with upsert', async () => {
    const file = makeFile('logo.webp', 'image/webp', 512);
    const result = await uploadShowLogo('show-42', file);

    expect(mockFrom).toHaveBeenCalledWith('images');
    expect(mockUpload).toHaveBeenCalledWith(
      'shows/show-42/logo.webp',
      file,
      expect.objectContaining({ upsert: true })
    );
    expect(result.success).toBe(true);
    expect(result.url).toContain('shows/show-42/logo.webp');
  });

  it('rejects files over 5MB', async () => {
    const file = makeFile('huge.gif', 'image/gif', 10 * 1024 * 1024);
    const result = await uploadShowLogo('show-42', file);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/too large/i);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('rejects non-image files', async () => {
    const file = makeFile('logo.svg', 'image/svg+xml', 256);
    const result = await uploadShowLogo('show-42', file);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid file type/i);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('returns error when upload throws', async () => {
    mockUpload.mockRejectedValue(new Error('Network failure'));
    const file = makeFile('logo.png', 'image/png', 1024);
    const result = await uploadShowLogo('show-42', file);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/failed to upload/i);
  });
});
