/** The Volunteers page for one show (MYK9-2328): the whole volunteer list and schedule. */
export function volunteersPagePath(showId: string): string {
  return `/secretary/volunteers?showId=${encodeURIComponent(showId)}`;
}
