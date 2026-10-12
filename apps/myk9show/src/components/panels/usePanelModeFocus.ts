import { useEffect, useRef, type RefObject } from 'react';

// A form's entry point is its first FIELD: a tab strip or a photo button may
// come first in the DOM, and focusing that would make the user Tab past it.
const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="combobox"]:not([disabled])';
const ANY_CONTROL_SELECTOR = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function firstEntry(body: HTMLElement): HTMLElement | null {
  return (
    body.querySelector<HTMLElement>(FIELD_SELECTOR) ??
    body.querySelector<HTMLElement>(ANY_CONTROL_SELECTOR)
  );
}

interface PanelModeFocusOptions<M extends string> {
  /** The view showing now. */
  mode: M;
  /** The view a form returns to (a list, a step screen, a dog form). */
  home: M;
  /** The container of the form view; its first field takes focus on entry. */
  formRef: RefObject<HTMLElement | null>;
  /** Where focus lands back on `home`, given the mode just left. */
  returnTarget: (left: M) => HTMLElement | null | undefined;
  /** False while the host is closed: track the mode, move nothing. */
  enabled?: boolean;
  /**
   * Changes when `home` swaps its own content (a new step, a removed row) and
   * unmounts the control that had focus. Focus then goes to `returnTarget(home)`.
   */
  homeKey?: string | undefined;
}

/**
 * The control that had focus unmounts (or is hidden) whenever a panel swaps its
 * body for a form and back, which would drop focus to <body> and let Tab leave
 * the modal (the Message Center compose and Manage Registrations pattern,
 * MYK9-1088 / MYK9-1089). Hand focus to the new view's entry point: the form's
 * first field going in, the caller's chosen control coming back.
 *
 * Inline forms make their discard prompt return focus nowhere (`finalFocus`),
 * so this hook is also what places focus after Discard.
 */
export function usePanelModeFocus<M extends string>({
  mode,
  home,
  formRef,
  returnTarget,
  enabled = true,
  homeKey,
}: PanelModeFocusOptions<M>) {
  const previous = useRef({ mode, homeKey });
  useEffect(() => {
    const { mode: left, homeKey: leftKey } = previous.current;
    if (left === mode && (mode !== home || leftKey === homeKey)) return;
    previous.current = { mode, homeKey };
    if (!enabled) return;
    if (mode !== home) {
      const body = formRef.current;
      if (body) (firstEntry(body) ?? body).focus();
      return;
    }
    returnTarget(left)?.focus();
  }, [mode, home, formRef, returnTarget, enabled, homeKey]);
}
