import { useCallback, useState, type RefObject } from 'react';

import { layoutStorage } from '@/components/layout/masterDetailStorage';

import { RAIL_PX, clampRailWidth, cockpitSplitTemplate, railMaxWidth } from './cockpitSplit';

/** Per device, like the other dragged pane sizes; one width for every show. */
export const RAIL_WIDTH_STORAGE_KEY = 'myk9:show-desk:rail-width';

function readChosenWidth(): number {
  const saved = Number(layoutStorage.getItem(RAIL_WIDTH_STORAGE_KEY));
  return Number.isFinite(saved) && saved >= RAIL_PX ? saved : RAIL_PX;
}

/**
 * The schedule rail's width beside a focused class (MYK9-2142): the width the secretary dragged
 * it to, remembered on this device, shown at the widest the cockpit's current width allows. The
 * chosen width is kept as chosen, so a narrower window does not shrink it for good.
 */
export function useCockpitRailWidth(
  containerWidth: number | null,
  /** The split grid, so a drag can move the rail without re-rendering the desk on every frame. */
  gridRef: RefObject<HTMLElement | null>
): {
  width: number;
  max: number;
  /** A settled width: saved, and the desk re-renders at it. */
  setWidth: (next: number) => void;
  /** A width still being dragged: written straight to the grid, neither saved nor rendered. */
  previewWidth: (next: number) => void;
} {
  const [chosen, setChosen] = useState(readChosenWidth);
  const container = containerWidth ?? 0;
  const setWidth = useCallback(
    (next: number) => {
      const clamped = clampRailWidth(next, container);
      setChosen(clamped);
      layoutStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(clamped));
    },
    [container]
  );
  const previewWidth = useCallback(
    (next: number) => {
      const grid = gridRef.current;
      if (!grid) return;
      grid.style.gridTemplateColumns = cockpitSplitTemplate(true, clampRailWidth(next, container));
    },
    [container, gridRef]
  );
  return {
    width: clampRailWidth(chosen, container),
    max: railMaxWidth(container),
    setWidth,
    previewWidth,
  };
}
