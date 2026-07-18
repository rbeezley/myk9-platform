/**
 * The table has six data columns plus selection/actions. Below this width the
 * enrollment cards are easier to scan and keep the secretary's actions
 * reachable without relying on horizontal scrolling.
 */
export const ENTRY_TABLE_MIN_CONTENT_WIDTH = 840;

export function shouldUseEntryCards(
  contentWidth: number | null,
  isMobileViewport: boolean
): boolean {
  return (
    isMobileViewport || (contentWidth !== null && contentWidth < ENTRY_TABLE_MIN_CONTENT_WIDTH)
  );
}
