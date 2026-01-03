import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle } from 'lucide-react';
import { buildClasses } from '@/utils/designTokens';

// Base field wrapper
interface FieldWrapperProps {
  label: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
}

export function FieldWrapper({ label, error, required, children, htmlFor }: FieldWrapperProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
      {error && (
        <div className="flex items-center text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mr-1" />
          <span id={`${htmlFor}-error`}>{error}</span>
        </div>
      )}
    </div>
  );
}

// Validated input field
interface ValidatedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  required?: boolean;
}

export function ValidatedInput({ 
  label, 
  error, 
  required, 
  className, 
  ...props 
}: ValidatedInputProps) {
  return (
    <FieldWrapper label={label} error={error} required={required} htmlFor={props.id}>
      <Input
        className={cn(
          error && 'border-destructive focus-visible:ring-destructive',
          className
        )}
        {...props}
      />
    </FieldWrapper>
  );
}

// Validated textarea field
interface ValidatedTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  required?: boolean;
}

export function ValidatedTextarea({ 
  label, 
  error, 
  required, 
  className, 
  ...props 
}: ValidatedTextareaProps) {
  return (
    <FieldWrapper label={label} error={error} required={required} htmlFor={props.id}>
      <Textarea
        className={cn(
          error && 'border-destructive focus-visible:ring-destructive',
          className
        )}
        {...props}
      />
    </FieldWrapper>
  );
}

// Validated select field
interface ValidatedSelectProps {
  label: string;
  error?: string;
  required?: boolean;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  options: Array<{ value: string; label: string }>;
}

export function ValidatedSelect({ 
  label, 
  error, 
  required, 
  value, 
  onValueChange, 
  placeholder,
  options 
}: ValidatedSelectProps) {
  return (
    <FieldWrapper label={label} error={error} required={required}>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={cn(error && 'border-destructive focus:ring-destructive')}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldWrapper>
  );
}

// Form layout components
interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium leading-6 text-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

interface FormGridProps {
  children: ReactNode;
  cols?: 1 | 2 | 3;
  className?: string;
}

export function FormGrid({ children, cols = 2, className }: FormGridProps) {
  const gridClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  };

  return (
    <div className={cn('grid gap-4', gridClasses[cols], className)}>
      {children}
    </div>
  );
}

// Form buttons
interface FormButtonsProps {
  onCancel?: () => void;
  onSave?: () => void;
  isSubmitting?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  saveDisabled?: boolean;
  className?: string;
}

export function FormButtons({
  onCancel,
  onSave,
  isSubmitting,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
  saveDisabled,
  className,
}: FormButtonsProps) {
  return (
    <div className={cn('flex justify-end space-x-3', className)}>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className={`${buildClasses.button.secondary} px-4 py-2 text-sm font-medium border rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
        >
          {cancelLabel}
        </button>
      )}
      {onSave && (
        <button
          type="submit"
          onClick={onSave}
          disabled={isSubmitting || saveDisabled}
          className={`${buildClasses.button.primary} px-4 py-2 text-sm font-medium border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
        >
          {isSubmitting ? 'Saving...' : saveLabel}
        </button>
      )}
    </div>
  );
}

// Error summary component
interface FormErrorSummaryProps {
  errors: Record<string, string>;
  className?: string;
}

export function FormErrorSummary({ errors, className }: FormErrorSummaryProps) {
  const errorEntries = Object.entries(errors).filter(([, message]) => message);
  
  if (errorEntries.length === 0) return null;

  return (
    <div className={cn(
      'rounded-md bg-destructive/10 p-4 border border-destructive/20',
      className
    )}>
      <div className="flex">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <div className="ml-3">
          <h3 className="text-sm font-medium text-destructive">
            Please correct the following errors:
          </h3>
          <div className="mt-2 text-sm text-destructive/80">
            <ul className="list-disc pl-5 space-y-1">
              {errorEntries.map(([field, message]) => (
                <li key={field}>{message}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}