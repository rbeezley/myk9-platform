/**
 * The ONE switch for AKC Nationals (MYK9-2488).
 *
 * Owner decision 2026-11-26: Nationals runs once a year and may never use this
 * software, so every Nationals surface is hidden. Nothing was deleted: the
 * scoresheet, leaderboard, coin flip by points, `shows.is_nationals` and their
 * tests are all still here.
 *
 * To bring Nationals back, set this to `true`. That restores, together:
 * - the "Nationals event" checkbox in show setup (the only way to flag a show);
 * - the Nationals scoresheet for a flagged AKC Scent Work show;
 * - the Nationals Leaderboard (Ringside menu, Results tab and its routes);
 * - ranking ties by points on a flagged show's Results tab.
 */
export const AKC_NATIONALS_ENABLED: boolean = false;

export function isAkcNationalsEnabled(): boolean {
  return AKC_NATIONALS_ENABLED;
}

/**
 * Whether this show gets the Nationals surfaces. Every read of a show's flag
 * for UI goes through here, so a show still flagged in the database shows
 * nothing Nationals-specific while the switch is off.
 */
export function showIsNationals(
  show: { isNationals?: boolean | null | undefined } | null | undefined
): boolean {
  return isAkcNationalsEnabled() && show?.isNationals === true;
}
