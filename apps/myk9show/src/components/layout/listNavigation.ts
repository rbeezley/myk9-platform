/**
 * Router state carried by navigation that starts inside a master-detail list (a row click, Up/Down,
 * opening a record from select mode). A detail pane reads it to tell "stepping through the list",
 * where focus stays on the list row, from arriving from anywhere else, where the new record's
 * heading takes focus and the page scrolls to the top.
 */
export const LIST_NAVIGATION_STATE = { fromList: true } as const;

export function isListNavigation(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { fromList?: unknown }).fromList === true
  );
}
