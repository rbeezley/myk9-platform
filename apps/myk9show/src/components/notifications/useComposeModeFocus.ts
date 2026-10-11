import { useEffect, useRef, type RefObject } from 'react';

/**
 * The control that had focus unmounts on every Message Center mode switch,
 * which would drop focus to <body> and let Tab leave the modal. Hand it to the
 * new mode's entry point: the first form control when composing, the Compose
 * button when back on the list.
 */
export function useComposeModeFocus(
  isComposing: boolean,
  listBarRef: RefObject<HTMLElement | null>,
  composeBodyRef: RefObject<HTMLElement | null>
) {
  const wasComposingRef = useRef(false);
  useEffect(() => {
    if (isComposing === wasComposingRef.current) return;
    wasComposingRef.current = isComposing;
    if (isComposing) {
      const body = composeBodyRef.current;
      const first = body?.querySelector<HTMLElement>('input, select, textarea, button, [href]');
      (first ?? body)?.focus();
    } else {
      listBarRef.current?.querySelector<HTMLElement>('button')?.focus();
    }
  }, [isComposing, listBarRef, composeBodyRef]);
}
