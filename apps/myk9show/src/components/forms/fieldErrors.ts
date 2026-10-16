import { createContext, useContext } from 'react';

/**
 * One required-field error, shown directly under its field with an arrow
 * pointing up at it (the same cue the browser's own bubble gives on sign-up,
 * but stylable, and it works on custom controls such as comboboxes, date
 * pickers and Base UI selects).
 *
 * Wiring: render the callout right after the control and spread
 * `useFieldError(id).controlProps` on the control, so it reads as invalid and is
 * described by the message. Errors come from a `FieldErrorsProvider` keyed by
 * the control's `id`, or straight from an `error` prop on a leaf component.
 */

export type FieldErrorMap = Readonly<Record<string, string>>;

const EMPTY: FieldErrorMap = {};
export const FieldErrorsContext = createContext<FieldErrorMap>(EMPTY);

export function fieldErrorId(fieldId: string): string {
  return `${fieldId}-error`;
}

/** aria wiring for a control whose error is `message` (empty when valid). */
export function fieldErrorControlProps(
  fieldId: string,
  message: string | undefined
): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  return message ? { 'aria-invalid': true, 'aria-describedby': fieldErrorId(fieldId) } : {};
}

/** Every field error in scope, for lists of controls that cannot call a hook per row. */
export function useFieldErrors(): FieldErrorMap {
  return useContext(FieldErrorsContext);
}

/** The message for `fieldId` from the nearest provider, plus the control's aria props. */
export function useFieldError(fieldId: string, override?: string | undefined) {
  const errors = useContext(FieldErrorsContext);
  const message = override ?? errors[fieldId];
  return { message, controlProps: fieldErrorControlProps(fieldId, message) };
}

/**
 * Focus the first control that reads as invalid inside `root` and centre it.
 * Document order is the order the secretary reads the form in. Returns whether
 * anything was found. Custom controls expose `aria-invalid` on their trigger,
 * so this lands on the trigger.
 */
export function focusFirstInvalidField(root: ParentNode | null | undefined): boolean {
  const target = root?.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!target) return false;
  target.focus({ preventScroll: true });
  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  return true;
}
