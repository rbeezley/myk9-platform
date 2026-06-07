/** Presentation helpers for show presence (kept out of the component file so it
 *  exports only components — react-refresh/only-export-components). */

/** Initials for an avatar fallback: first + last initial, or first letter. */
export function presenceInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}
