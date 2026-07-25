import { useState } from 'react';
import { supabase } from '@/services/database/supabaseClient';
import { notifications } from '@/lib/notifications';
import { friendlyDbError } from '@/utils/friendlyDbError';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

interface UseAvatarUploadOptions {
  onSuccess?: (publicUrl: string) => Promise<void> | void;
}

export function useAvatarUpload({ onSuccess }: UseAvatarUploadOptions) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      const message = 'Please select a JPG, PNG, or WebP image.';
      notifications.error(message);
      setError(message);
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      const message = 'Image must be under 5MB.';
      notifications.error(message);
      setError(message);
      return;
    }

    setUploading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authUid = session?.user?.id;
      if (!authUid) {
        const message = 'Not authenticated.';
        notifications.error(message);
        setError(message);
        return;
      }

      const ext = file.name.split('.').pop() || 'jpg';
      // Path must use auth.uid() as the second segment — Storage RLS policy
      // "Users can upload their own profile photos" checks foldername[2] = auth.uid().
      const path = `profiles/${authUid}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('images').getPublicUrl(path);

      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      await onSuccess?.(publicUrl);
      notifications.success('Profile photo updated.');
    } catch (err) {
      const message = friendlyDbError(err, 'Failed to save profile photo.');
      notifications.error(message);
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading, error };
}
