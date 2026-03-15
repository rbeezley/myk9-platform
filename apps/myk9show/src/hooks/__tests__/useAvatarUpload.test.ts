import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { mockSupabase } from '@/test/mocks/supabase';

vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { notifications } from '@/lib/notifications';

import { useAvatarUpload } from '../useAvatarUpload';

function createFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe('useAvatarUpload', () => {
  const userId = 'user-123';
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset storage mock defaults
    mockSupabase.storage.from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'profiles/user-123/avatar.jpg' }, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({
        data: { publicUrl: 'https://storage.test/profiles/user-123/avatar.jpg' },
      }),
      remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
  });

  it('rejects files with invalid MIME type', async () => {
    const { result } = renderHook(() => useAvatarUpload({ userId, onSuccess }));
    const pdfFile = createFile('doc.pdf', 1024, 'application/pdf');

    await act(async () => {
      await result.current.upload(pdfFile);
    });

    expect(notifications.error).toHaveBeenCalledWith('Please select a JPG, PNG, or WebP image.');
    expect(mockSupabase.storage.from).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('rejects files over 5MB', async () => {
    const { result } = renderHook(() => useAvatarUpload({ userId, onSuccess }));
    const largeFile = createFile('big.jpg', 6 * 1024 * 1024, 'image/jpeg');

    await act(async () => {
      await result.current.upload(largeFile);
    });

    expect(notifications.error).toHaveBeenCalledWith('Image must be under 5MB.');
    expect(mockSupabase.storage.from).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('uploads successfully and calls onSuccess with public URL', async () => {
    const { result } = renderHook(() => useAvatarUpload({ userId, onSuccess }));
    const file = createFile('photo.png', 1024, 'image/png');

    await act(async () => {
      await result.current.upload(file);
    });

    expect(mockSupabase.storage.from).toHaveBeenCalledWith('images');
    const storageBucket = mockSupabase.storage.from.mock.results[0]!.value;
    expect(storageBucket.upload).toHaveBeenCalledWith(
      'profiles/user-123/avatar.png',
      file,
      { upsert: true, contentType: 'image/png' },
    );
    expect(onSuccess).toHaveBeenCalledWith(
      expect.stringContaining('https://storage.test/profiles/user-123/avatar.jpg'),
    );
    expect(notifications.success).toHaveBeenCalledWith('Profile photo updated.');
  });

  it('calls notifications.error on upload failure', async () => {
    mockSupabase.storage.from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: null, error: new Error('Storage quota exceeded') }),
      getPublicUrl: vi.fn(),
      remove: vi.fn(),
    });

    const { result } = renderHook(() => useAvatarUpload({ userId, onSuccess }));
    const file = createFile('photo.jpg', 1024, 'image/jpeg');

    await act(async () => {
      await result.current.upload(file);
    });

    expect(notifications.error).toHaveBeenCalledWith('Storage quota exceeded');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('sets uploading to true during upload and false after', async () => {
    let resolveUpload!: (value: unknown) => void;
    const uploadPromise = new Promise((resolve) => {
      resolveUpload = resolve;
    });

    mockSupabase.storage.from.mockReturnValue({
      upload: vi.fn().mockReturnValue(uploadPromise),
      getPublicUrl: vi.fn().mockReturnValue({
        data: { publicUrl: 'https://storage.test/avatar.jpg' },
      }),
      remove: vi.fn(),
    });

    const { result } = renderHook(() => useAvatarUpload({ userId, onSuccess }));
    const file = createFile('photo.jpg', 1024, 'image/jpeg');

    expect(result.current.uploading).toBe(false);

    let uploadFinished: Promise<void>;
    act(() => {
      uploadFinished = result.current.upload(file);
    });

    // uploading should be true while waiting
    expect(result.current.uploading).toBe(true);

    // Resolve the upload
    await act(async () => {
      resolveUpload({ data: { path: 'test' }, error: null });
      await uploadFinished!;
    });

    expect(result.current.uploading).toBe(false);
  });
});
