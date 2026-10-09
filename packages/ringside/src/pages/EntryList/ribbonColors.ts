/**
 * ribbonColors — placement ribbon colours by registry (MYK9-1086).
 *
 * Source notes live in docs/plan-ringside-entry-list-redesign.md: UKC from the
 * official Conformation Rulebook; AKC from secondary sources citing Rules
 * Applying to Dog Shows ch. 5 §2; ASCA uses AKC's by owner decision
 * (2026-10-09, no ASCA source found).
 */

export type RibbonRegistry = 'AKC' | 'UKC' | 'ASCA';

export interface RibbonColor {
  /** Badge fill. */
  background: string;
  /** Text on the fill. */
  text: string;
  /** Outline, so a white ribbon does not vanish on a white row. */
  outline: string;
}

const BLUE: RibbonColor = { background: '#1f5fa8', text: '#ffffff', outline: '#1f5fa8' };
const RED: RibbonColor = { background: '#c0392b', text: '#ffffff', outline: '#c0392b' };
const YELLOW: RibbonColor = { background: '#f2c230', text: '#3d2e00', outline: '#d9a91a' };
const WHITE: RibbonColor = { background: '#ffffff', text: '#24211d', outline: '#b8b2a7' };
const GREEN: RibbonColor = { background: '#2f7d32', text: '#ffffff', outline: '#2f7d32' };

const RIBBONS: Record<RibbonRegistry, readonly RibbonColor[]> = {
  AKC: [BLUE, RED, YELLOW, WHITE],
  ASCA: [BLUE, RED, YELLOW, WHITE],
  UKC: [BLUE, RED, GREEN, YELLOW],
};

/** Neutral badge for 5th and beyond, or a placement we cannot colour. */
export const NEUTRAL_RIBBON: RibbonColor = {
  background: '#efece6',
  text: '#24211d',
  outline: '#d6d0c4',
};

export function getRibbonColor(
  registry: string | null | undefined,
  placement: number | null | undefined
): RibbonColor {
  if (!placement || placement < 1) return NEUTRAL_RIBBON;
  const key = (registry ?? 'AKC').toUpperCase() as RibbonRegistry;
  const set = RIBBONS[key] ?? RIBBONS.AKC;
  return set[placement - 1] ?? NEUTRAL_RIBBON;
}
