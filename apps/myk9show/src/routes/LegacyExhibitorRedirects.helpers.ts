export function getLegacyShowDayRedirectTarget(search: string, selectedShowId: string): string {
  const queryShowId = new URLSearchParams(search).get('showId')?.trim();
  const showId = queryShowId || selectedShowId.trim();
  return showId ? `/at-show/${encodeURIComponent(showId)}` : '/exhibitor/entries';
}
