import { useState } from 'react';
import { supabase } from '@/services/database/supabaseClient';
import { notifications } from '@/lib/notifications';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

interface UseAvatarUploadOptions {
  onSuccess?: (publicUrl: string) => void;
}

export function useAvatarUpload({ onSuccess }: UseAvatarUploadOptions) {
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      notifications.error('Please select a JPG, PNG, or WebP image.');
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      notifications.error('Image must be under 5MB.');
      return;
    }

    setUploading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authUid = session?.user?.id;
      if (!authUid) {
        notifications.error('Not authenticated.');
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
      onSuccess?.(publicUrl);
      notifications.success('Profile photo updated.');
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Failed to upload photo.');
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading };
}
