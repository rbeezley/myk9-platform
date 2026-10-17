import { createContext, useContext, useState, useSyncExternalStore } from 'react';

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
 * Which field ids currently have a callout on screen, in the order they mounted. A callout
 * registers itself on mount and unregisters on unmount, so anything that does NOT appear here
 * (its control is hidden, say) has no visible feedback and must reach the top banner instead.
 */
export interface FieldErrorRegistry {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => readonly string[];
  register: (fieldId: string) => () => void;
}

export function createFieldErrorRegistry(): FieldErrorRegistry {
  const counts = new Map<string, number>();
  let snapshot: readonly string[] = [];
  const listeners = new Set<() => void>();
  const publish = () => {
    snapshot = [...counts.keys()];
    listeners.forEach(listener => listener());
  };
  return {
    subscribe: listener => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    register: fieldId => {
      const had = counts.has(fieldId);
      counts.set(fieldId, (counts.get(fieldId) ?? 0) + 1);
      if (!had) publish();
      return () => {
        const next = (counts.get(fieldId) ?? 1) - 1;
        if (next > 0) {
          counts.set(fieldId, next);
          return;
        }
        counts.delete(fieldId);
        publish();
      };
    },
  };
}

export const FieldRegistryContext = createContext<FieldErrorRegistry | null>(null);

/** For the page that owns the provider: a registry plus the field ids that have a callout. */
export function useFieldErrorRegistry(): {
  registry: FieldErrorRegistry;
  registered: readonly string[];
} {
  const [registry] = useState(createFieldErrorRegistry);
  const registered = useSyncExternalStore(registry.subscribe, registry.getSnapshot);
  return { registry, registered };
}

/**
 * Find the control for each field id (by its own id, or by the callout it is described by,
 * for controls such as tabs that carry no id) and return the earliest in document order.
 */
export function findFirstFieldControl(
  fieldIds: readonly string[],
  root: ParentNode = document
): HTMLElement | null {
  let first: HTMLElement | null = null;
  for (const id of fieldIds) {
    const escaped = CSS.escape(id);
    const el = root.querySelector<HTMLElement>(
      `[id="${escaped}"], [aria-describedby~="${CSS.escape(fieldErrorId(id))}"]`
    );
    if (!el) continue;
    if (!first || first.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) first = el;
  }
  return first;
}

/** Focus the earliest control among `fieldIds` and centre it. False when none is mounted. */
export function focusFirstFieldControl(
  fieldIds: readonly string[],
  root: ParentNode = document
): boolean {
  const target = findFirstFieldControl(fieldIds, root);
  if (!target) return false;
  target.focus({ preventScroll: true });
  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  return true;
}
