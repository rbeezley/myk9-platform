/**
 * Self Check-In Cascade Resolution
 *
 * Cascade: class ?? trial ?? show ?? true
 * Each level can override the parent. null/undefined means inherit.
 */

/**
 * Resolve the effective self check-in setting through the cascade.
 *
 * @param show - Show-level setting (null = default to true)
 * @param trial - Trial-level override (null/undefined = inherit from show)
 * @param cls - Class-level override (null/undefined = inherit from trial)
 * @returns Whether self check-in is enabled
 */
export function resolveCheckinCascade(
  show?: boolean | null,
  trial?: boolean | null,
  cls?: boolean | null
): boolean {
  if (cls != null) return cls;
  if (trial != null) return trial;
  if (show != null) return show;
  return true; // ultimate default
}
