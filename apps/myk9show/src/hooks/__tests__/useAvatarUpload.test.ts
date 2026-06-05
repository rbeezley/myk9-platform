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

const AUTH_UID = 'auth-uid-abc';

function createFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe('useAvatarUpload', () => {
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: AUTH_UID } } },
      error: null,
    });
    mockSupabase.storage.from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: `profiles/${AUTH_UID}/avatar.jpg` }, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({
        data: { publicUrl: `https://storage.test/profiles/${AUTH_UID}/avatar.jpg` },
      }),
      remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
  });

  it('rejects files with invalid MIME type', async () => {
    const { result } = renderHook(() => useAvatarUpload({ onSuccess }));
    const pdfFile = createFile('doc.pdf', 1024, 'application/pdf');

    await act(async () => {
      await result.current.upload(pdfFile);
    });

    expect(notifications.error).toHaveBeenCalledWith('Please select a JPG, PNG, or WebP image.');
    expect(mockSupabase.storage.from).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('rejects files over 5MB', async () => {
    const { result } = renderHook(() => useAvatarUpload({ onSuccess }));
    const largeFile = createFile('big.jpg', 6 * 1024 * 1024, 'image/jpeg');

    await act(async () => {
      await result.current.upload(largeFile);
    });

    expect(notifications.error).toHaveBeenCalledWith('Image must be under 5MB.');
    expect(mockSupabase.storage.from).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('uses auth.uid() — not a people.id — as the Storage path segment', async () => {
    const { result } = renderHook(() => useAvatarUpload({ onSuccess }));
    const file = createFile('photo.png', 1024, 'image/png');

    await act(async () => {
      await result.current.upload(file);
    });

    expect(mockSupabase.storage.from).toHaveBeenCalledWith('images');
    const storageBucket = mockSupabase.storage.from.mock.results[0]!.value;
    // Path must be profiles/{auth.uid()}/... — Storage RLS checks foldername[2] = auth.uid()
    expect(storageBucket.upload).toHaveBeenCalledWith(
      `profiles/${AUTH_UID}/avatar.png`,
      file,
      { upsert: true, contentType: 'image/png' },
    );
    expect(onSuccess).toHaveBeenCalledWith(
      expect.stringContaining(`https://storage.test/profiles/${AUTH_UID}/avatar.jpg`),
    );
    expect(notifications.success).toHaveBeenCalledWith('Profile photo updated.');
  });

  it('errors when user is not authenticated', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const { result } = renderHook(() => useAvatarUpload({ onSuccess }));
    const file = createFile('photo.jpg', 1024, 'image/jpeg');

    await act(async () => {
      await result.current.upload(file);
    });

    expect(notifications.error).toHaveBeenCalledWith('Not authenticated.');
    expect(mockSupabase.storage.from).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('calls notifications.error on upload failure', async () => {
    mockSupabase.storage.from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: null, error: new Error('Storage quota exceeded') }),
      getPublicUrl: vi.fn(),
      remove: vi.fn(),
    });

    const { result } = renderHook(() => useAvatarUpload({ onSuccess }));
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

    const { result } = renderHook(() => useAvatarUpload({ onSuccess }));
    const file = createFile('photo.jpg', 1024, 'image/jpeg');

    expect(result.current.uploading).toBe(false);

    let uploadFinished: Promise<void>;
    act(() => {
      uploadFinished = result.current.upload(file);
    });

    expect(result.current.uploading).toBe(true);

    await act(async () => {
      resolveUpload({ data: { path: 'test' }, error: null });
      await uploadFinished!;
    });

    expect(result.current.uploading).toBe(false);
  });
});
