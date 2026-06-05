import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveDogPhoto } from '../utils';
import { uploadDogPhoto } from '@/services/imageUploadService';
import type { Dog } from '@/types/dog-types';

vi.mock('@/services/imageUploadService', () => ({
  uploadDogPhoto: vi.fn(),
}));

const mockUploadDogPhoto = vi.mocked(uploadDogPhoto);

// A real Supabase Storage public URL — deliberately NOT a `data:` URL, which is
// what the buggy path used to persist.
const STORAGE_URL =
  'https://example.supabase.co/storage/v1/object/public/images/dogs/auth-uid-1/dog-1/123-photo.png';

function makeFile() {
  return new File(['fake-bytes'], 'photo.png', { type: 'image/png' });
}

function makeSavedDog(imageUrl: string): Dog {
  return { id: 'dog-1', ownerId: 'owner-1', callName: 'Rex', name: 'Rex', imageUrl } as Dog;
}

describe('saveDogPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads the file then persists the returned Storage URL via onUpdate', async () => {
    mockUploadDogPhoto.mockResolvedValue({ success: true, url: STORAGE_URL });
    const onUpdate = vi.fn().mockResolvedValue(makeSavedDog(STORAGE_URL));
    const file = makeFile();

    const result = await saveDogPhoto({ dogId: 'dog-1', file, onUpdate });

    // uploadDogPhoto now derives auth.uid() internally — only dogId + file are passed.
    expect(mockUploadDogPhoto).toHaveBeenCalledWith('dog-1', file);
    // The durable Storage URL — not a `data:` URL — is what gets written to the row.
    expect(onUpdate).toHaveBeenCalledWith('dog-1', { imageUrl: STORAGE_URL });
    expect(result).toEqual({
      success: true,
      dog: makeSavedDog(STORAGE_URL),
      imageUrl: STORAGE_URL,
    });
  });

  it('does not persist and reports failure when the upload fails', async () => {
    mockUploadDogPhoto.mockResolvedValue({ success: false, error: 'Storage 500' });
    const onUpdate = vi.fn();

    const result = await saveDogPhoto({ dogId: 'dog-1', file: makeFile(), onUpdate });

    expect(onUpdate).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Storage 500');
  });

  it('reports failure when onUpdate returns null (nothing persisted)', async () => {
    mockUploadDogPhoto.mockResolvedValue({ success: true, url: STORAGE_URL });
    const onUpdate = vi.fn().mockResolvedValue(null);

    const result = await saveDogPhoto({ dogId: 'dog-1', file: makeFile(), onUpdate });

    expect(result.success).toBe(false);
    expect(result.imageUrl).toBe(STORAGE_URL);
  });

  it('does not claim success when no persistence path is wired', async () => {
    mockUploadDogPhoto.mockResolvedValue({ success: true, url: STORAGE_URL });

    const result = await saveDogPhoto({ dogId: 'dog-1', file: makeFile() });

    expect(result.success).toBe(false);
  });
});
