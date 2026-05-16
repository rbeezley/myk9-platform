import { type CSSProperties, type JSX } from 'react';
import { posterColors } from '../tokens';

export interface PosterInkBlotProps {
  /** Container-relative position. Defaults to top-right corner overflow. */
  position?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Diameter in px. Defaults to 720 (hero scale). */
  size?: number;
  /** Fill color — accepts any CSS color. Defaults to posterColors.red. */
  color?: string;
  /** Deeper sibling for the radial gradient stop. Defaults to posterColors.redDeep. */
  colorDeep?: string;
  /** Blend mode for layering on cream background. Defaults to 'multiply'. */
  blendMode?: CSSProperties['mixBlendMode'];
  /** Skip the entry animation (used in receipts and other static contexts). */
  staticMount?: boolean;
  /** Optional drop-shadow filter. Pass null to disable. */
  filter?: string | null;
}

/**
 * The Poster ink-blot — a colored circular wash that overlays the page in
 * `mix-blend-mode: multiply`, giving it the texture of red ink soaking
 * into cream paper.
 *
 * Decorative only — `aria-hidden`, `pointer-events: none`, absolutely
 * positioned within the nearest positioned ancestor. The container must
 * be `overflow: hidden` since the blot intentionally crops at the page
 * edge (per design spec).
 *
 * The radial gradient (red → redDeep at 70%) gives the shape internal
 * dimension without breaking the flat-poster register. Don't replace
 * with a solid color — it loses the printed-ink quality.
 */
export function PosterInkBlot({
  position,
  size = 720,
  color = posterColors.red,
  colorDeep = posterColors.redDeep,
  blendMode = 'multiply',
  staticMount = false,
  filter = 'drop-shadow(0 8px 32px rgba(200, 59, 26, 0.35))',
}: PosterInkBlotProps): JSX.Element {
  const pos: CSSProperties = {};
  if (position?.top != null) pos.top = position.top;
  if (position?.right != null) pos.right = position.right;
  if (position?.bottom != null) pos.bottom = position.bottom;
  if (position?.left != null) pos.left = position.left;
  // Default to the hero position if none supplied.
  if (Object.keys(pos).length === 0) {
    pos.top = 80;
    pos.right = -180;
  }

  const style: CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    borderRadius: '50%',
    background: `radial-gradient(circle at 30% 30%, ${color} 0%, ${colorDeep} 70%)`,
    pointerEvents: 'none',
    mixBlendMode: blendMode,
    ...pos,
  };
  if (filter) style.filter = filter;

  return (
    <div
      aria-hidden
      data-testid="poster-ink-blot"
      className={staticMount ? 'po-ink-blot' : 'po-ink-blot po-ink-blot--animate'}
      style={style}
    />
  );
}
