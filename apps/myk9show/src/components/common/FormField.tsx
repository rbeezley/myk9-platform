import React from 'react';
import { Label } from '@/components/ui/label/label';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: string;
  fieldId: string;
  required?: boolean;
  error?: string | undefined;
  hint?: string | undefined;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  fieldId,
  required = false,
  error,
  hint,
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
        {required && (
          <>
            <span className="text-destructive ml-0.5" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        )}
      </Label>

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {children}

      {error && (
        <p id={`${fieldId}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
