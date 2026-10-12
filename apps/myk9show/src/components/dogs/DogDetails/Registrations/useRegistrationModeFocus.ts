import { useEffect, useRef, type RefObject } from 'react';

export const EDIT_REGISTRATION_ATTR = 'data-edit-registration';

/**
 * The control that opened Add or Edit unmounts when the Manage panel swaps to
 * the form, which would drop focus to <body> and let Tab leave the modal
 * (the Message Center compose pattern, MYK9-1088). Hand focus to the new mode's
 * entry point: the first form control going in; the control that opened it
 * coming out — that row's Edit button after an Edit, the header Add after an Add.
 */
export function useRegistrationModeFocus(
  mode: 'list' | 'add' | 'edit',
  editedId: string | null,
  listRef: RefObject<HTMLElement | null>,
  formRef: RefObject<HTMLElement | null>,
  addButtonRef: RefObject<HTMLElement | null>
) {
  const previous = useRef({ mode, editedId });
  useEffect(() => {
    const was = previous.current;
    if (was.mode === mode) {
      previous.current = { mode, editedId: editedId ?? was.editedId };
      return;
    }
    previous.current = { mode, editedId };
    if (mode !== 'list') {
      const body = formRef.current;
      const first = body?.querySelector<HTMLElement>('input, select, textarea, button, [href]');
      (first ?? body)?.focus();
      return;
    }
    const row =
      was.mode === 'edit' && was.editedId
        ? listRef.current?.querySelector<HTMLElement>(
            `[${EDIT_REGISTRATION_ATTR}="${CSS.escape(was.editedId)}"]`
          )
        : null;
    (row ?? addButtonRef.current)?.focus();
  }, [mode, editedId, listRef, formRef, addButtonRef]);
}
