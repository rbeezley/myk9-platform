import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LIST_NAVIGATION_STATE } from './listNavigation';

/**
 * "Select" mode for a master-detail list: it swaps the split for the full-width table so its
 * checkboxes and bulk bar work.
 *
 * `exitSelectMode` is the ONE way out (Done, opening a record, creating one, losing the split):
 * it always drops the ticks too, so a hidden selection can never feed the bulk bar. Losing the
 * split (a narrow window, where the Done button does not exist) ends the mode with its ticks, so
 * it cannot come back when the window widens.
 */
export function useSelectMode({
  splitCapable,
  clearSelection,
}: {
  splitCapable: boolean;
  clearSelection: () => void;
}) {
  const [selectMode, setSelectMode] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Starts empty: ticks made in a narrow window must not reappear pre-loaded in the bulk bar.
  const enterSelectMode = useCallback(() => {
    clearSelection();
    setSelectMode(true);
  }, [clearSelection]);
  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    clearSelection();
  }, [clearSelection]);
  if (selectMode && !splitCapable) exitSelectMode();

  // Opening a record ends select mode, so it shows beside the list. The focused table row is about
  // to unmount; without the focus call, focus falls to the body.
  const navigate = useNavigate();
  const openRecord = useCallback(
    (href: string) => {
      exitSelectMode();
      buttonRef.current?.focus();
      navigate(href, { state: LIST_NAVIGATION_STATE });
    },
    [exitSelectMode, navigate]
  );

  return {
    selectMode,
    /** The split is showing: wide screen and not selecting. */
    splitOpen: splitCapable && !selectMode,
    enterSelectMode,
    exitSelectMode,
    openRecord,
    buttonRef,
  };
}
