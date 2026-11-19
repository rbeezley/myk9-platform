const KEY_PREFIX = 'myk9.firstShowPublished.';

/**
 * MYK9-2199: remembers, on this device, that a club has had a public show, so the first-show
 * card stays gone if that show later goes back to draft, is cancelled or is deleted. There is
 * no server record of a first publication to read yet; storage failures just mean no memory.
 */
export function markFirstShowPublished(clubId: string): void {
  try {
    localStorage.setItem(KEY_PREFIX + clubId, '1');
  } catch {
    // Storage blocked: the card then follows the current shows only.
  }
}

export function hasFirstShowPublished(clubId: string): boolean {
  try {
    return localStorage.getItem(KEY_PREFIX + clubId) === '1';
  } catch {
    return false;
  }
}
