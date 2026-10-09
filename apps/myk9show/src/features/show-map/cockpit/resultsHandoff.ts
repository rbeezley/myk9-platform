import type { SecretaryCockpitClass } from './secretaryCockpitTypes';

/**
 * MYK9-1032: the show's scoring is over, so the work moves from Overview to Results.
 *
 * True when at least one class is running and every one of them is complete. Cancelled classes
 * never run, so they do not hold the hand-off back; a class whose lifecycle could not be read
 * does (an unknown is not a complete).
 */
export function isEveryClassComplete(
  classes: readonly Pick<SecretaryCockpitClass, 'lifecycle'>[]
): boolean {
  const running = classes.filter(item => item.lifecycle !== 'cancelled');
  return running.length > 0 && running.every(item => item.lifecycle === 'complete');
}
