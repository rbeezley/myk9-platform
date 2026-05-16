import { type CSSProperties, type JSX } from 'react';
import { posterColors, posterSquareRotation } from '../tokens';

export interface PosterRotatingSquareProps {
  /** Container-relative position. Defaults to bottom-left corner overflow. */
  position?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Side length in px. Defaults to 320 (hero scale). */
  size?: number;
  /** Fill color. Defaults to posterColors.olive. */
  color?: string;
  /** Final rotation in degrees. Defaults to 8 (the design-system anchor angle). */
  rotation?: number;
  /** Blend mode for layering on cream. Defaults to 'multiply'. */
  blendMode?: CSSProperties['mixBlendMode'];
  /** Skip the entry animation. */
  staticMount?: boolean;
}

/**
 * The Poster rotating square — an olive solid block tilted at the
 * signature 8° angle. Like the ink-blot, this is a load-bearing element
 * of the Poster identity, not decoration. The rotation is **baked-in**,
 * not animated — the entry transition rotates it into place once and
 * holds.
 *
 * Decorative only — `aria-hidden`, `pointer-events: none`, absolutely
 * positioned within the nearest positioned ancestor. Container must be
 * `overflow: hidden` so the corner crops at the page edge.
 *
 * The angle is exposed via `--po-square-rot` CSS var on the element so
 * the keyframe animation can land on the correct final rotation regardless
 * of the prop value.
 */
export function PosterRotatingSquare({
  position,
  size = 320,
  color = posterColors.olive,
  rotation = posterSquareRotation,
  blendMode = 'multiply',
  staticMount = false,
}: PosterRotatingSquareProps): JSX.Element {
  const pos: CSSProperties = {};
  if (position?.top != null) pos.top = position.top;
  if (position?.right != null) pos.right = position.right;
  if (position?.bottom != null) pos.bottom = position.bottom;
  if (position?.left != null) pos.left = position.left;
  if (Object.keys(pos).length === 0) {
    pos.bottom = -80;
    pos.left = -80;
  }

  const style: CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    background: color,
    transform: `rotate(${rotation}deg)`,
    pointerEvents: 'none',
    mixBlendMode: blendMode,
    ['--po-square-rot' as string]: `${rotation}deg`,
    ...pos,
  };

  return (
    <div
      aria-hidden
      data-testid="poster-rotating-square"
      className={
        staticMount ? 'po-rotating-square' : 'po-rotating-square po-rotating-square--animate'
      }
      style={style}
    />
  );
}
