import React from 'react';
import { Label } from '@/components/ui/label/label';
import { cn } from '@/lib/utils';
import { OptionalMark, RequiredMark } from './RequiredMark';

interface FormFieldProps {
  label: string;
  fieldId: string;
  required?: boolean;
  /** Marks the field "(optional)" in the one standard spelling. */
  optional?: boolean;
  error?: string | undefined;
  hint?: string | undefined;
  hintClassName?: string | undefined;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  fieldId,
  required = false,
  optional = false,
  error,
  hint,
  hintClassName,
  children,
  className,
}: FormFieldProps) {
  return (
    <div
      className={cn('form-field space-y-1.5', className)}
      {...(error ? { 'data-error': '' } : {})}
    >
      <Label htmlFor={fieldId}>
        {label}
        {required && <RequiredMark />}
        {!required && optional && <OptionalMark />}
      </Label>

      {hint && (
        <p id={`${fieldId}-hint`} className={cn('text-xs text-muted-foreground', hintClassName)}>
          {hint}
        </p>
      )}

      {children}

      {error && (
        <p id={`${fieldId}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
