import React, { useContext, useLayoutEffect, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import {
  FieldErrorsContext,
  FieldRegistryContext,
  fieldErrorId,
  useFieldError,
  type FieldErrorMap,
  type FieldErrorRegistry,
} from './fieldErrors';

export const FieldErrorsProvider: React.FC<{
  errors: FieldErrorMap;
  /** Lets callouts report that they are on screen (see `createFieldErrorRegistry`). */
  registry?: FieldErrorRegistry | undefined;
  children: React.ReactNode;
}> = ({ errors, registry, children }) => (
  <FieldRegistryContext.Provider value={registry ?? null}>
    <FieldErrorsContext.Provider value={errors}>{children}</FieldErrorsContext.Provider>
  </FieldRegistryContext.Provider>
);

const noopSubscribe = () => () => undefined;
const NONE: readonly string[] = [];
const emptySnapshot = (): readonly string[] => NONE;

interface FieldErrorProps {
  /** The control's `id`. The callout's own id is `${field}-error`. */
  field: string;
  /** Overrides the provider's message for this field (leaf components with an `error` prop). */
  message?: string | undefined;
  className?: string | undefined;
}

export const FieldError: React.FC<FieldErrorProps> = ({ field, message, className }) => {
  const { message: text } = useFieldError(field, message);
  const registry = useContext(FieldRegistryContext);
  const shown = Boolean(text);
  // Layout effect: the page learns the callout is there before the browser paints.
  useLayoutEffect(
    () => (registry && shown ? registry.register(field) : undefined),
    [registry, shown, field]
  );
  const registered = useSyncExternalStore(
    registry?.subscribe ?? noopSubscribe,
    registry?.getSnapshot ?? emptySnapshot
  );
  if (!text) return null;
  // Several callouts at once would all be announced; only the first speaks up, the rest are
  // still read through the control's aria-describedby.
  const announces = !registry || registered[0] === field || !registered.includes(field);
  return (
    <div
      id={fieldErrorId(field)}
      {...(announces && { role: 'alert' })}
      className={cn(
        'relative mt-2.5 rounded-md border border-destructive bg-card px-3 py-2 text-sm text-destructive shadow-sm whitespace-pre-line',
        className
      )}
    >
      {/* The arrow: a rotated square whose two upper edges continue the bubble's border. */}
      <span
        aria-hidden="true"
        className="absolute -top-[5px] left-4 block h-2.5 w-2.5 rotate-45 border-l border-t border-destructive bg-card"
      />
      {text}
    </div>
  );
};
