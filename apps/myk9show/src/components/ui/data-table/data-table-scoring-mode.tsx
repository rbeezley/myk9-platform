/* eslint-disable react-refresh/only-export-components */
import { useRef, useCallback, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseScoringModeProps {
  enabled: boolean;
  rows: Array<{ id: string; [key: string]: unknown }>;
  /** Column order for auto-advance (left to right) */
  editableColumns: string[];
  /** Which columns are conditional based on row data */
  conditionalFields?: Record<string, (row: unknown) => boolean>;
  /** Column ID that contains the result value (for keystroke mapping) */
  resultColumnId?: string;
  /** Column ID that determines if a row is "scored" (for progress) */
  scoredFieldId?: string;
}

interface UndoEntry {
  rowId: string;
  columnId: string;
  value: unknown;
}

export interface UseScoringModeReturn {
  /** Is a specific column editable for this row */
  isFieldEditable: (rowId: string, columnId: string) => boolean;
  /** Handle single-keystroke result entry */
  handleResultKeystroke: (key: string) => string | null;
  /** Get auto-advance target after committing a cell */
  getNextCell: (
    currentRowId: string,
    currentColumnId: string,
    resultValue?: string
  ) => { rowId: string; columnId: string } | null;
  /** Undo last edit */
  undo: () => UndoEntry | null;
  /** Push to undo stack */
  pushUndo: (rowId: string, columnId: string, oldValue: unknown) => void;
  /** Progress: how many rows have been scored */
  scoredCount: number;
  totalCount: number;
}

// ─── Keystroke map ────────────────────────────────────────────────────────────

const RESULT_KEYS: Record<string, string> = {
  q: 'Qualify',
  Q: 'Qualify',
  n: 'NQ',
  N: 'NQ',
  e: 'Eliminated',
  E: 'Eliminated',
  a: 'Absent',
  A: 'Absent',
  '1': 'Qualify',
  '2': 'NQ',
  '3': 'Eliminated',
  '4': 'Absent',
};

const MAX_UNDO = 50;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useScoringMode({
  enabled,
  rows,
  editableColumns,
  conditionalFields,
  resultColumnId,
  scoredFieldId,
}: UseScoringModeProps): UseScoringModeReturn {
  // Use a ref for the undo stack — mutations don't need to trigger re-renders
  const undoStackRef = useRef<UndoEntry[]>([]);

  // Build a lookup for rows by id
  const rowMap = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows]);

  // ── isFieldEditable ──────────────────────────────────────────────────────

  const isFieldEditable = useCallback(
    (rowId: string, columnId: string): boolean => {
      if (!enabled) return false;
      const row = rowMap.get(rowId);
      if (!row) return false;
      const condition = conditionalFields?.[columnId];
      if (condition) {
        return condition(row);
      }
      return true;
    },
    [enabled, rowMap, conditionalFields]
  );

  // ── handleResultKeystroke ────────────────────────────────────────────────

  const handleResultKeystroke = useCallback((key: string): string | null => {
    return RESULT_KEYS[key] ?? null;
  }, []);

  // ── getNextCell ──────────────────────────────────────────────────────────

  const getNextCell = useCallback(
    (
      currentRowId: string,
      currentColumnId: string,
      resultValue?: string
    ): { rowId: string; columnId: string } | null => {
      const rowIndex = rows.findIndex(r => r.id === currentRowId);
      if (rowIndex === -1) return null;

      const colIndex = editableColumns.indexOf(currentColumnId);

      // Helper: can this column be used for the given row?
      const canEdit = (rowId: string, colId: string): boolean => {
        if (!conditionalFields?.[colId]) return true;
        const row = rowMap.get(rowId);
        if (!row) return false;
        return conditionalFields[colId](row);
      };

      // Determine the result for the current row (used for conditional logic)
      const getRowResult = (rowId: string): string => {
        if (!resultColumnId) return '';
        const row = rowMap.get(rowId);
        if (!row) return '';
        return String(row[resultColumnId] ?? '');
      };

      // Special handling by column type
      if (currentColumnId === resultColumnId) {
        // After result: Absent → next row time; otherwise → faults
        const effectiveResult = resultValue ?? getRowResult(currentRowId);

        if (effectiveResult === 'Absent') {
          // Skip to next row's time
          if (rowIndex + 1 < rows.length) {
            return { rowId: rows[rowIndex + 1].id, columnId: editableColumns[0] };
          }
          return null;
        }

        // Find faults column (next after result that is always editable)
        const faultsIdx = colIndex + 1;
        if (faultsIdx < editableColumns.length) {
          const faultsCol = editableColumns[faultsIdx];
          if (canEdit(currentRowId, faultsCol)) {
            return { rowId: currentRowId, columnId: faultsCol };
          }
        }
        // Fall through to next row
        if (rowIndex + 1 < rows.length) {
          return { rowId: rows[rowIndex + 1].id, columnId: editableColumns[0] };
        }
        return null;
      }

      // Check if we're on the faults column (one after result)
      const resultIdx = resultColumnId ? editableColumns.indexOf(resultColumnId) : -1;
      const isFaultsColumn = resultIdx !== -1 && colIndex === resultIdx + 1;

      if (isFaultsColumn) {
        // After faults: check if reason is editable for this row
        const nextColIdx = colIndex + 1;
        if (nextColIdx < editableColumns.length) {
          const nextCol = editableColumns[nextColIdx];
          if (canEdit(currentRowId, nextCol)) {
            return { rowId: currentRowId, columnId: nextCol };
          }
        }
        // Reason not editable (Qualify/Absent) → next row time
        if (rowIndex + 1 < rows.length) {
          return { rowId: rows[rowIndex + 1].id, columnId: editableColumns[0] };
        }
        return null;
      }

      // Generic: advance to next column in this row, skipping non-editable ones
      for (let i = colIndex + 1; i < editableColumns.length; i++) {
        const col = editableColumns[i];
        if (canEdit(currentRowId, col)) {
          return { rowId: currentRowId, columnId: col };
        }
      }

      // No more columns in this row — move to next row's first column (time)
      if (rowIndex + 1 < rows.length) {
        return { rowId: rows[rowIndex + 1].id, columnId: editableColumns[0] };
      }

      return null;
    },
    [rows, editableColumns, conditionalFields, resultColumnId, rowMap]
  );

  // ── Undo stack ───────────────────────────────────────────────────────────

  const pushUndo = useCallback((rowId: string, columnId: string, oldValue: unknown) => {
    const stack = undoStackRef.current;
    const next = [...stack, { rowId, columnId, value: oldValue }];
    // Keep at most MAX_UNDO entries (drop oldest)
    undoStackRef.current = next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next;
  }, []);

  const undo = useCallback((): UndoEntry | null => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return null;
    const entry = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, stack.length - 1);
    return entry;
  }, []);

  // ── Progress ─────────────────────────────────────────────────────────────

  const { scoredCount, totalCount } = useMemo(() => {
    const total = rows.length;
    if (!scoredFieldId) return { scoredCount: 0, totalCount: total };
    const scored = rows.filter(r => {
      const v = r[scoredFieldId];
      return v !== null && v !== undefined && v !== '';
    }).length;
    return { scoredCount: scored, totalCount: total };
  }, [rows, scoredFieldId]);

  return {
    isFieldEditable,
    handleResultKeystroke,
    getNextCell,
    undo,
    pushUndo,
    scoredCount,
    totalCount,
  };
}

// ─── ScoringProgress ──────────────────────────────────────────────────────────

export function ScoringProgress({ scored, total }: { scored: number; total: number }) {
  const pct = total > 0 ? (scored / total) * 100 : 0;

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>
        {scored} of {total} scored
      </span>
      <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
