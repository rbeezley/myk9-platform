/**
 * Image Upload Service
 *
 * Handles uploading images to Supabase Storage for profile photos and dog photos.
 */

import { supabase } from './database/supabaseClient';
import { logger } from './LoggingService';

const BUCKET_NAME = 'images';
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const ALLOWED_TYPES: readonly string[] = ALLOWED_IMAGE_TYPES;

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Validate file before upload
 */
function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File is too large. Maximum size is 5MB.';
  }
  return null;
}

/**
 * Generate a unique file path for storage
 */
function generateFilePath(folder: string, userId: string, fileName: string): string {
  const timestamp = Date.now();
  const ext = fileName.split('.').pop() || 'jpg';
  const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
  const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${folder}/${userId}/${timestamp}-${sanitizedName.slice(0, 50)}.${ext}`;
}

/**
 * Upload a profile photo for a person.
 *
 * Path: profiles/{auth.uid()}/{timestamp}-{name}
 * Storage policy "Users can upload their own profile photos" requires the second
 * path segment to equal auth.uid(), so we derive it here rather than accept a
 * person_id (which is a different UUID and would fail the policy).
 */
export async function uploadProfilePhoto(file: File): Promise<UploadResult> {
  const validationError = validateFile(file);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const authUid = session?.user?.id;
  if (!authUid) {
    return { success: false, error: 'Not authenticated' };
  }

  const filePath = generateFilePath('profiles', authUid, file.name);

  try {
    const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
    });

    if (uploadError) {
      logger.error('Upload error', 'image-upload', { error: uploadError.message });
      return { success: false, error: uploadError.message };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

    return { success: true, url: publicUrl };
  } catch (error) {
    logger.error('Upload failed', 'image-upload', undefined, error as Error);
    return { success: false, error: 'Failed to upload image. Please try again.' };
  }
}

/**
 * Upload a photo for a dog.
 *
 * Path: dogs/{auth.uid()}/{timestamp}-{name}
 * Storage policy "Users can upload dog photos to their folder" requires the second
 * path segment to equal auth.uid(), so we derive it from the session rather than
 * using the dog's owner_id (a people.id UUID, not an auth UID).
 */
export async function uploadDogPhoto(dogId: string, file: File): Promise<UploadResult> {
  const validationError = validateFile(file);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const authUid = session?.user?.id;
  if (!authUid) {
    return { success: false, error: 'Not authenticated' };
  }

  const filePath = generateFilePath(`dogs/${authUid}`, dogId, file.name);

  try {
    const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
    });

    if (uploadError) {
      logger.error('Upload error', 'image-upload', { error: uploadError.message });
      return { success: false, error: uploadError.message };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

    return { success: true, url: publicUrl };
  } catch (error) {
    logger.error('Upload failed', 'image-upload', undefined, error as Error);
    return { success: false, error: 'Failed to upload image. Please try again.' };
  }
}

/**
 * Delete an image from storage
 */
export async function deleteImage(imageUrl: string): Promise<boolean> {
  try {
    // Extract the file path from the URL
    const url = new URL(imageUrl);
    const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/images\/(.+)/);

    if (!pathMatch) {
      logger.warn('Could not extract file path from URL', 'image-upload', { url: imageUrl });
      return false;
    }

    // Strip query params (e.g., ?t=timestamp cache busters) from the path
    const filePath = pathMatch[1].split('?')[0];
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([filePath]);

    if (error) {
      logger.error('Delete error', 'image-upload', { error: error.message });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Delete failed', 'image-upload', undefined, error as Error);
    return false;
  }
}

export const BRANDING_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function uploadBrandingImage(
  folder: string,
  entityId: string,
  fileName: string,
  file: File
): Promise<UploadResult> {
  if (!BRANDING_ALLOWED_TYPES.includes(file.type)) {
    return {
      success: false,
      error: 'Invalid file type. Please upload a JPEG, PNG, or WebP image.',
    };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: 'File is too large. Maximum size is 5MB.' };
  }

  const filePath = `${folder}/${entityId}/${fileName}`;

  try {
    const { error } = await supabase.storage.from(BUCKET_NAME).upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
    });

    if (error) {
      logger.error('Upload error', 'image-upload', { error: error.message });
      return { success: false, error: error.message };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    // Cache bust: append timestamp so browsers refetch after re-upload
    const url = `${publicUrl}?t=${Date.now()}`;
    return { success: true, url };
  } catch (error) {
    logger.error('Upload failed', 'image-upload', undefined, error as Error);
    return { success: false, error: 'Failed to upload image. Please try again.' };
  }
}

export async function uploadClubCover(clubId: string, file: File): Promise<UploadResult> {
  return uploadBrandingImage('clubs', clubId, 'cover.webp', file);
}

export async function uploadShowCover(showId: string, file: File): Promise<UploadResult> {
  return uploadBrandingImage('shows', showId, 'cover.webp', file);
}

export async function uploadShowLogo(showId: string, file: File): Promise<UploadResult> {
  return uploadBrandingImage('shows', showId, 'logo.webp', file);
}

/**
 * Get file info for validation display
 */
export function getFileValidationInfo() {
  return {
    maxSize: MAX_FILE_SIZE,
    maxSizeMB: MAX_FILE_SIZE / (1024 * 1024),
    allowedTypes: ALLOWED_TYPES,
    allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  };
}
