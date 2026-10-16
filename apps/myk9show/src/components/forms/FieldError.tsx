import React from 'react';
import { cn } from '@/lib/utils';
import { FieldErrorsContext, fieldErrorId, useFieldError, type FieldErrorMap } from './fieldErrors';

export const FieldErrorsProvider: React.FC<{
  errors: FieldErrorMap;
  children: React.ReactNode;
}> = ({ errors, children }) => (
  <FieldErrorsContext.Provider value={errors}>{children}</FieldErrorsContext.Provider>
);

interface FieldErrorProps {
  /** The control's `id`. The callout's own id is `${field}-error`. */
  field: string;
  /** Overrides the provider's message for this field (leaf components with an `error` prop). */
  message?: string | undefined;
  className?: string | undefined;
}

export const FieldError: React.FC<FieldErrorProps> = ({ field, message, className }) => {
  const { message: text } = useFieldError(field, message);
  if (!text) return null;
  return (
    <div
      id={fieldErrorId(field)}
      role="alert"
      className={cn(
        'relative mt-2.5 rounded-md border border-destructive bg-card px-3 py-2 text-sm text-destructive shadow-sm',
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
