/**
 * Image Upload Service
 *
 * Handles uploading images to Supabase Storage for profile photos and dog photos.
 */

import { supabase } from './database/supabaseClient';
import { logger } from './LoggingService';

const BUCKET_NAME = 'images';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

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
 * Upload a profile photo for a person
 */
export async function uploadProfilePhoto(userId: string, file: File): Promise<UploadResult> {
  const validationError = validateFile(file);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const filePath = generateFilePath('profiles', userId, file.name);

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
 * Upload a photo for a dog
 */
export async function uploadDogPhoto(
  ownerId: string,
  dogId: string,
  file: File
): Promise<UploadResult> {
  const validationError = validateFile(file);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const filePath = generateFilePath(`dogs/${ownerId}`, dogId, file.name);

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

    const filePath = pathMatch[1];
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

const BRANDING_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
