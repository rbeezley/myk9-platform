/**
 * ONE armband contract for the packet, shared by the browser and the edge
 * function (MYK9-243).
 *
 * An armband is a LABEL, not a number. `armbands.armband_number` and
 * `entries.armband` are both `text`, and dog shows really do issue suffixed
 * armbands ("12A") when a dog is added beside an existing number. The packet
 * model used to type it `number`, which left no representation for those --
 * the RPC mapped anything failing `^[0-9]+$` to the sentinel `0`, and paper
 * then printed `#0`, a number no dog wears, sorted ahead of every real entry.
 *
 * So the model carries the label verbatim and derives ordering from it here.
 * Two functions, one source of truth, and no second field that can drift out
 * of step with the first.
 */

/** What a row prints when a dog genuinely has no armband yet. */
export const UNASSIGNED_ARMBAND_DISPLAY = '—';

/**
 * The label exactly as issued, or null when there is none. Never a sentinel:
 * "no armband" and "armband 0" must stay distinguishable, because only one of
 * them is a fact about the dog.
 */
export type PacketArmband = string | null;

/**
 * Leading digits, for ordering. `12A` sorts as 12 -- beside `12`, which is
 * where the ring steward expects it, since a suffixed armband exists
 * precisely to sit next to the number it extends.
 *
 * Returns null when there are no leading digits at all (including for an
 * unassigned armband), and the comparator sorts those LAST. That is the
 * opposite of the old sentinel behaviour, which sorted them first and put a
 * dog nobody could identify at the head of the running order.
 *
 * Bounded to 9 digits deliberately: an unbounded run of digits overflows
 * `Number.MAX_SAFE_INTEGER` and collapses distinct armbands onto one another.
 */
export function armbandSortKey(armband: PacketArmband): number | null {
  if (armband == null) return null;
  const match = /^\s*(\d{1,9})/.exec(armband);
  return match ? Number(match[1]) : null;
}

/**
 * Order two armbands: numerically by leading digits, unassigned last, then by
 * the full label so `12` precedes `12A` deterministically.
 */
export function compareArmbands(a: PacketArmband, b: PacketArmband): number {
  const keyA = armbandSortKey(a);
  const keyB = armbandSortKey(b);
  if (keyA !== keyB) {
    if (keyA == null) return 1;
    if (keyB == null) return -1;
    return keyA - keyB;
  }
  return (a ?? '').localeCompare(b ?? '');
}

/** The label a page prints: the armband as issued, or an em dash. */
export function formatPacketArmband(armband: PacketArmband): string {
  const trimmed = armband?.trim() ?? '';
  return trimmed === '' ? UNASSIGNED_ARMBAND_DISPLAY : trimmed;
}

/**
 * The single boundary where a raw database value becomes a `PacketArmband`.
 *
 * `entries.armband` is `text`, but several app read paths still hand this a
 * `number` (and older rows a legacy `0` meaning "unassigned"). Both collapse
 * to null here so exactly one representation of "no armband" reaches the
 * renderer -- the whole point of MYK9-243 is that a sentinel must never
 * survive far enough to be printed as though it were an armband.
 */
export function normalizePacketArmband(value: string | number | null | undefined): PacketArmband {
  if (value == null) return null;
  if (typeof value === 'number') {
    // 0 was the old "unassigned" sentinel and NaN comes from `Number('12A')`
    // upstream; neither is an armband a dog wears.
    return value === 0 || Number.isNaN(value) ? null : String(value);
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
