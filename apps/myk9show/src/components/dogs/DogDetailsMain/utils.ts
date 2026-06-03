import { getDogDisplayName, type Dog, type DogInput } from '@/types/dog-types';
import { uploadDogPhoto } from '@/services/imageUploadService';

// Constants
export const CELEBRATION_DURATION_MS = 3000;
export const CELEBRATION_FADE_DELAY_MS = 1000;
export const MAX_FILE_SIZE_MB = 5;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Formats a date string from storage format (YYYY-MM-DD) to display format (M/D/YYYY)
 */
export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';

  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = dateStr.split('-');
    return `${parseInt(month, 10)}/${parseInt(day, 10)}/${year}`;
  }

  return dateStr;
}

/**
 * Validate image file type and size
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: 'Please select a valid image file (JPEG, PNG, GIF, or WebP)' };
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return { valid: false, error: `Image must be smaller than ${MAX_FILE_SIZE_MB}MB` };
  }
  return { valid: true };
}

/**
 * Convert Dog form data to DogInput for database updates
 */
export function convertDogToDogInput(dogData: Partial<Dog>, currentDog: Dog): Partial<DogInput> {
  // Extract breed from registrations or use existing dog breed
  const breed =
    dogData.registrations?.[0]?.breed || currentDog.registrations?.[0]?.breed || 'Unknown';

  // Build result object conditionally to comply with exactOptionalPropertyTypes
  const result: Partial<DogInput> = {
    breed: breed,
    sex: (dogData.sex || dogData.gender?.toLowerCase()) as 'male' | 'female',
    ownerId: dogData.ownerId || currentDog.ownerId,
  };

  // Only add optional properties if they have defined values
  const name =
    getDogDisplayName({ callName: dogData.callName, name: dogData.name || '' }) || undefined;
  if (name !== undefined) result.name = name;
  if (dogData.callName !== undefined) result.callName = dogData.callName;
  const birthDate = dogData.dateOfBirth || dogData.birthDate;
  if (birthDate !== undefined) result.birthDate = birthDate;
  if (dogData.color !== undefined) result.color = dogData.color;
  const weight = typeof dogData.weight === 'string' ? parseFloat(dogData.weight) : dogData.weight;
  if (weight !== undefined) result.weight = weight;
  const height = typeof dogData.height === 'string' ? parseFloat(dogData.height) : dogData.height;
  if (height !== undefined) result.height = height;
  if (dogData.ownerName !== undefined) result.ownerName = dogData.ownerName;
  const microchipNumber = dogData.microchip || dogData.microchipNumber;
  if (microchipNumber !== undefined) result.microchipNumber = microchipNumber;
  if (dogData.imageUrl !== undefined) result.imageUrl = dogData.imageUrl;
  if (dogData.registrations !== undefined) {
    result.registrations = dogData.registrations.map(reg => ({
      organization: reg.organization,
      number: reg.registrationNumber,
      registeredName: reg.registeredName,
      type: reg.breed || 'Unknown',
      status: reg.status,
    }));
  }
  if (dogData.healthRecords !== undefined) result.healthRecords = dogData.healthRecords;
  if (dogData.spayedNeutered !== undefined) result.spayedNeutered = dogData.spayedNeutered;

  return result;
}

export interface SaveDogPhotoArgs {
  ownerId: string;
  dogId: string;
  file: File;
  onUpdate?: ((id: string, updates: Partial<DogInput>) => Promise<Dog | null>) | undefined;
}

export interface SaveDogPhotoResult {
  success: boolean;
  dog?: Dog;
  imageUrl?: string;
  error?: string;
}

/**
 * Upload a dog photo to Storage and persist the resulting URL to the database.
 *
 * The dog detail photo dialog previously only set local React state with the
 * base64 FileReader preview, so the photo silently vanished on reload. This
 * mirrors the edit-panel save path: upload the real File → persist the durable
 * Storage URL via `onUpdate` → return the saved row. On any failure it returns a
 * typed result (never throws an uncaught success) so the UI cannot report a
 * false "Photo updated successfully".
 */
export async function saveDogPhoto({
  ownerId,
  dogId,
  file,
  onUpdate,
}: SaveDogPhotoArgs): Promise<SaveDogPhotoResult> {
  const upload = await uploadDogPhoto(ownerId, dogId, file);
  if (!upload.success || !upload.url) {
    return { success: false, error: upload.error ?? 'Image upload failed' };
  }

  const imageUrl = upload.url;

  // Without a persistence path the photo cannot survive a reload — fail loudly
  // rather than claim success (this is the bug we are fixing).
  if (!onUpdate) {
    return { success: false, imageUrl, error: 'Saving is not available right now' };
  }

  const savedDog = await onUpdate(dogId, { imageUrl });
  if (!savedDog) {
    return { success: false, imageUrl, error: 'No data returned from dog update' };
  }

  return { success: true, dog: savedDog, imageUrl };
}
