import { useCallback, useState } from 'react';

import { layoutStorage } from '@/components/layout/masterDetailStorage';

import { RAIL_PX, clampRailWidth, railMaxWidth } from './cockpitSplit';

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
export function useCockpitRailWidth(containerWidth: number | null): {
  width: number;
  max: number;
  /** `remember: false` while a drag is still moving: only where it ends is saved. */
  setWidth: (next: number, remember?: boolean) => void;
} {
  const [chosen, setChosen] = useState(readChosenWidth);
  const container = containerWidth ?? 0;
  const setWidth = useCallback(
    (next: number, remember = true) => {
      const clamped = clampRailWidth(next, container);
      setChosen(clamped);
      if (remember) layoutStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(clamped));
    },
    [container]
  );
  return { width: clampRailWidth(chosen, container), max: railMaxWidth(container), setWidth };
}
