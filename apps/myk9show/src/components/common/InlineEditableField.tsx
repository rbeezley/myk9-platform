/**
 * InlineEditableField — Click-to-edit field for property sidebars.
 *
 * Display mode: renders value as text with a pencil icon on hover.
 * Edit mode: renders an input (text, number, date, or select).
 * Saves on blur or Enter, cancels on Escape.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Pencil, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type InlineFieldType = 'text' | 'number' | 'date' | 'select';

export interface SelectOption {
  label: string;
  value: string;
}

export interface InlineEditableFieldProps {
  /** Current display value. */
  value: string | number | null | undefined;
  /** Field type determines the input rendered in edit mode. */
  fieldType?: InlineFieldType | undefined;
  /** Options for select fields. */
  options?: SelectOption[] | undefined;
  /** Called with the new value. Should throw on failure. */
  onSave: (value: string) => Promise<void>;
  /** Accessible label for the edit button. */
  label: string;
  /** Suffix appended to display value (e.g., "lbs", '"'). */
  suffix?: string | undefined;
  /** Placeholder shown when value is empty. */
  placeholder?: string | undefined;
  /** Disable editing (read-only). */
  disabled?: boolean | undefined;
}

export function InlineEditableField({
  value,
  fieldType = 'text',
  options,
  onSave,
  label,
  suffix,
  placeholder = 'Not set',
  disabled,
}: InlineEditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const displayValue = value != null && value !== '' ? String(value) : null;

  // Clean up success timer on unmount
  useEffect(() => () => clearTimeout(successTimerRef.current), []);

  const startEditing = useCallback(() => {
    if (disabled || isSaving) return;
    setEditValue(displayValue ?? '');
    setError(null);
    setIsEditing(true);
  }, [disabled, isSaving, displayValue]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  const savingRef = useRef(false);

  const handleSave = useCallback(async () => {
    // Guard against concurrent saves (blur fires after Enter)
    if (savingRef.current) return;

    const trimmed = editValue.trim();
    // No change — just close
    if (trimmed === (displayValue ?? '')) {
      setIsEditing(false);
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setIsEditing(false);
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 600);
      successTimerRef.current = timer;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
      savingRef.current = false;
    }
  }, [editValue, displayValue, onSave]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setError(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  // Edit mode
  if (isEditing) {
    const inputClasses = cn(
      'w-full text-sm font-medium bg-transparent rounded-md px-2 py-1',
      'border outline-none transition-colors',
      error
        ? 'border-destructive/40 ring-2 ring-destructive/20'
        : 'border-primary/40 ring-2 ring-primary/20'
    );

    return (
      <div className="w-full">
        <div className="flex items-center gap-1">
          {fieldType === 'select' && options ? (
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className={inputClasses}
              disabled={isSaving}
            >
              <option value="">— None —</option>
              {options.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type={fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text'}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className={inputClasses}
              disabled={isSaving}
            />
          )}
          {isSaving && (
            <Loader2 className="h-3 w-3 text-muted-foreground animate-spin flex-shrink-0" />
          )}
        </div>
        {error && (
          <p className="text-xs text-destructive mt-1 animate-in fade-in duration-150">{error}</p>
        )}
      </div>
    );
  }

  // Display mode
  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      className={cn(
        'group flex items-center gap-1.5 rounded-md px-2 py-1 -mx-2 w-[calc(100%+1rem)] text-right justify-end',
        'transition-colors duration-150',
        !disabled && 'hover:bg-muted/30 cursor-pointer',
        disabled && 'cursor-default'
      )}
      aria-label={`Edit ${label}`}
    >
      {showSuccess && (
        <Check className="h-3 w-3 text-green-500 flex-shrink-0 animate-in fade-in duration-150" />
      )}
      {displayValue ? (
        <span className="text-sm font-medium text-foreground">
          {displayValue}
          {suffix}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground/50 italic font-normal">{placeholder}</span>
      )}
      {!disabled && !showSuccess && (
        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      )}
    </button>
  );
}
