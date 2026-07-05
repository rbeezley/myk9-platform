// Reorder motion token = duration-layout (350ms) + ease-enter curve.
// See the motion language in docs/plan-motion-consistency.md.
export const REORDER_TRANSITION = { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const };

/**
 * Whether reordering cards should animate to their new position.
 *
 * `EntryCardGrid` is a NON-virtualized card grid (stable `entryId` keys), so a
 * FLIP-based `layout` animation is safe there — unlike virtualized react-window
 * lists, whose recycled DOM nodes would "animate" between unrelated entries
 * (the motion-language virtualization guard). Reduced-motion users get an
 * instant reposition (`false`) instead.
 */
export function reorderLayoutMode(
  prefersReducedMotion: boolean | null
): false | 'position' {
  return prefersReducedMotion ? false : 'position';
}
