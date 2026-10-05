/**
 * MYK9-1019: whether a full class takes wait-list requests.
 *
 * The show has one "Allow wait lists" setting (`shows.allow_waitlist`). A
 * class follows it unless the secretary set that class on its own
 * (`classes.allow_waitlist`: null follows the show, true/false is the class's
 * exception). Missing values are "no", the server's default.
 *
 * This is the client mirror of `public.class_allows_waitlist(class_id)`, the
 * rule every server reader decides on (migration 20261005184700). Read a
 * class's wait-list state through this, never from the class column alone.
 */
export function classAllowsWaitlist(
  classSetting: boolean | null | undefined,
  showSetting: boolean | null | undefined
): boolean {
  return classSetting ?? showSetting ?? false;
}
