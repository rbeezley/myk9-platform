import { useState, useCallback } from 'react';
import type { VisibilityState } from '@tanstack/react-table';

const STORAGE_PREFIX = 'datatable-cols-';

function readStored(tableId: string): VisibilityState {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${tableId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as VisibilityState;
    }
    return {};
  } catch {
    return {};
  }
}

export function useColumnVisibility(
  tableId?: string
): [VisibilityState, (state: VisibilityState) => void] {
  const [visibility, setVisibilityState] = useState<VisibilityState>(() =>
    tableId ? readStored(tableId) : {}
  );

  const setVisibility = useCallback(
    (next: VisibilityState) => {
      setVisibilityState(next);
      if (tableId) {
        try {
          localStorage.setItem(`${STORAGE_PREFIX}${tableId}`, JSON.stringify(next));
        } catch {
          // localStorage full or unavailable
        }
      }
    },
    [tableId]
  );

  return [visibility, setVisibility];
}
