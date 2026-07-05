import type { NotificationOptions } from '@/lib/notifications';
import type { Dog as DogType } from '@/types/dog-types';

/**
 * Build the "Dog saved" confirmation toast for a freshly created dog (4.E).
 *
 * The message always confirms the save by name. The optional "Enter a show"
 * next-action is included only when the caller supplied a handler — i.e. on the
 * standalone Dogs page, where entering a show is the natural next step. During
 * registration the dog is already being entered, so no handler is passed and
 * the toast is a plain confirmation.
 */
export function buildDogSavedToast(
  callName: string | undefined,
  newDog: DogType,
  onEnterShowWithDog?: ((dog: DogType) => void) | undefined
): { message: string; options?: NotificationOptions } {
  const dogName = callName?.trim() || 'Dog';
  const message = `${dogName} added`;
  if (!onEnterShowWithDog) return { message };
  return {
    message,
    options: {
      action: { label: 'Enter a show', onClick: () => onEnterShowWithDog(newDog) },
    },
  };
}
