export function getAtShowLeaderboardHref(showId: string): string {
  return `/at-show/${encodeURIComponent(showId)}/leaderboard`;
}
