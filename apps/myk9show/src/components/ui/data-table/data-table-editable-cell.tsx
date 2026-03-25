import { useState, useRef, useCallback, useEffect } from 'react';
import type { Row, Column } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { notifications } from '@/lib/notifications';
import type { EditType, EditComponentProps } from './types';

export interface EditableCellProps {
  value: unknown;
  editType: EditType;
  editOptions?: Array<{ label: string; value: string }>;
  validate?: (value: unknown) => string | null;
  editComponent?: (props: EditComponentProps<unknown>) => React.ReactNode;
  row: Row<unknown>;
  column: Column<unknown>;
  onSave?: (value: unknown) => Promise<void>;
  children?: React.ReactNode;
}

// ─── Editor renderers ────────────────────────────────────────────────────────

interface EditorProps {
  value: unknown;
  editType: EditType;
  editOptions: Array<{ label: string; value: string }> | undefined;
  editComponent: ((props: EditComponentProps<unknown>) => React.ReactNode) | undefined;
  row: Row<unknown>;
  column: Column<unknown>;
  onChange: (v: unknown) => void;
  onCommit: () => void;
  onCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

function CellEditor({
  value,
  editType,
  editOptions,
  editComponent,
  row,
  column,
  onChange,
  onCommit,
  onCancel,
  onKeyDown,
}: EditorProps) {
  const stringValue = value != null ? String(value) : '';

  if (editType === 'custom' && editComponent) {
    return (
      <>
        {editComponent({
          value,
          onChange,
          onCommit,
          onCancel,
          row,
          column,
        })}
      </>
    );
  }

  if (editType === 'select') {
    return (
      <select
        autoFocus
        value={stringValue}
        onChange={e => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={onKeyDown}
        className="w-full bg-background text-sm border border-input rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {editOptions?.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  const inputType = editType === 'number' ? 'number' : 'text';

  return (
    <input
      autoFocus
      type={inputType}
      value={stringValue}
      onChange={e => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={onKeyDown}
      className="w-full bg-background text-sm border border-input rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

// ─── DOM navigation helpers ───────────────────────────────────────────────────

function getAllEditableCells(within: HTMLElement): HTMLElement[] {
  const scope = within.closest('table') ?? within.closest('[data-datatable]') ?? document;
  return Array.from(scope.querySelectorAll<HTMLElement>('[data-editable-cell]'));
}

function focusEditableCell(el: HTMLElement) {
  el.click();
}

function navigateTab(currentEl: HTMLElement, reverse: boolean) {
  const cells = getAllEditableCells(currentEl);
  const idx = cells.indexOf(currentEl);
  if (idx === -1) return;
  const next = reverse ? cells[idx - 1] : cells[idx + 1];
  if (next) focusEditableCell(next);
}

function navigateEnter(currentEl: HTMLElement) {
  const columnId = currentEl.dataset.columnId;
  if (!columnId) return;

  const cells = getAllEditableCells(currentEl);
  const sameCols = cells.filter(c => c.dataset.columnId === columnId);
  const idx = sameCols.indexOf(currentEl);
  if (idx === -1) return;
  const next = sameCols[idx + 1];
  if (next) focusEditableCell(next);
}

// ─── EditableCell ─────────────────────────────────────────────────────────────

export function EditableCell({
  value: propValue,
  editType,
  editOptions,
  validate,
  editComponent,
  row,
  column,
  onSave,
  children,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [currentValue, setCurrentValueRaw] = useState<unknown>(propValue);
  const originalValueRef = useRef<unknown>(propValue);
  const [validationError, setValidationError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isDirty, setIsDirty] = useState(false);

  const setCurrentValue = useCallback((v: unknown) => {
    setCurrentValueRaw(v);
    setIsDirty(v !== originalValueRef.current);
  }, []);

  // Keep currentValue and originalValueRef in sync with propValue when not editing
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!editing) {
      setCurrentValueRaw(propValue);
      originalValueRef.current = propValue;
      setIsDirty(false);
    }
  }, [propValue, editing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
  }, []);

  const commit = useCallback(async () => {
    if (validate) {
      const err = validate(currentValue);
      if (err) {
        setValidationError(err);
        return;
      }
    }
    setValidationError(null);

    if (onSave && currentValue !== originalValueRef.current) {
      try {
        await onSave(currentValue);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save';
        notifications.error(msg);
        setCurrentValue(originalValueRef.current);
      }
    }
    setEditing(false);
  }, [currentValue, validate, onSave]);

  const cancel = useCallback(() => {
    setCurrentValue(originalValueRef.current);
    setValidationError(null);
    setEditing(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
        return;
      }

      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        // Commit first (async), then navigate
        const doNavigate = () => {
          if (!wrapperRef.current) return;
          if (e.key === 'Tab') {
            navigateTab(wrapperRef.current, e.shiftKey);
          } else {
            navigateEnter(wrapperRef.current);
          }
        };

        if (validate) {
          const err = validate(currentValue);
          if (err) {
            setValidationError(err);
            return;
          }
        }
        setValidationError(null);
        setEditing(false);

        if (onSave && currentValue !== originalValueRef.current) {
          onSave(currentValue).catch(err => {
            const msg = err instanceof Error ? err.message : 'Failed to save';
            notifications.error(msg);
            setCurrentValue(originalValueRef.current);
          });
        }

        // Navigate after a microtask so the DOM updates first
        setTimeout(doNavigate, 0);
      }
    },
    [cancel, currentValue, validate, onSave]
  );

  return (
    <div
      ref={wrapperRef}
      data-editable-cell
      data-column-id={column.id}
      onClick={handleClick}
      className={cn('relative min-w-0', isDirty && 'border-l-2 border-primary/50 pl-1')}
    >
      {editing ? (
        <div className="flex flex-col gap-0.5">
          <CellEditor
            value={currentValue}
            editType={editType}
            editOptions={editOptions}
            editComponent={editComponent}
            row={row}
            column={column}
            onChange={setCurrentValue}
            onCommit={commit}
            onCancel={cancel}
            onKeyDown={handleKeyDown}
          />
          {validationError && <span className="text-xs text-destructive">{validationError}</span>}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
