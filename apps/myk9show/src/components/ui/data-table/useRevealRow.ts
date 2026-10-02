import { useEffect, useRef } from 'react';
import type { Table } from '@tanstack/react-table';

export interface RevealRow {
  id: string;
  /** Reveal fires once per distinct key, so a repeat visit can pass a new one. */
  key: string;
}

/**
 * Brings one row into view across pagination: turns the table to the page that holds
 * `revealRow.id`, then calls `onRowRevealed` once that row is rendered, so the caller can
 * scroll to or focus it. Waits while the row is not in the table's data.
 */
export function useRevealRow<TData>(
  table: Table<TData>,
  revealRow: RevealRow | null | undefined,
  onRowRevealed: ((id: string) => void) | undefined
) {
  const revealedKey = useRef<string | null>(null);
  const revealId = revealRow?.id;
  const revealKey = revealRow?.key;
  // No dependency list on purpose: the row can arrive (data) or the page can settle (state)
  // on any render, and the early returns make a repeat run free.
  useEffect(() => {
    if (!revealId || !revealKey || revealedKey.current === revealKey) return;
    const { pageIndex, pageSize } = table.getState().pagination;
    const index = table.getPrePaginationRowModel().rows.findIndex(row => row.id === revealId);
    if (index < 0) return;
    const targetPage = Math.floor(index / pageSize);
    if (targetPage !== pageIndex) {
      table.setPageIndex(targetPage);
      return;
    }
    revealedKey.current = revealKey;
    onRowRevealed?.(revealId);
  });
}
