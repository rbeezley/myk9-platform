/**
 * RunOrderDialogSlot — ringside's `RunOrderDialog` slot, mounting the one
 * shared run-order dialog (`components/classes/RunOrderDialog`, also used by the
 * secretary results table). This adapter only maps ringside's prop contract
 * onto it: entries to the calculators' shape, `manual` to drag mode, and the
 * scope string to ringside's `'all' | 'A' | 'B'`.
 */
import React from 'react';
import type { RunOrderDialogProps, RunOrderScope } from '@myk9/ringside';
import { RunOrderDialog } from '@/components/classes/RunOrderDialog';
import type { RunOrderEntry } from '@/lib/runOrderUtils';

function toRingsideScope(scope: string | undefined): RunOrderScope {
  return scope === 'A' || scope === 'B' ? scope : 'all';
}

export const RunOrderDialogSlot: React.FC<RunOrderDialogProps> = ({
  isOpen,
  onClose,
  entries,
  onApplyOrder,
  onOpenDragMode,
}) => {
  const dialogEntries = React.useMemo<RunOrderEntry[]>(
    () =>
      entries.map(e => ({
        id: e.id,
        armband: e.armband != null ? String(e.armband) : null,
        section: e.section ?? null,
        runOrder: e.exhibitorOrder ?? null,
      })),
    [entries]
  );

  return (
    <RunOrderDialog
      open={isOpen}
      onOpenChange={open => {
        if (!open) onClose();
      }}
      entries={dialogEntries}
      onApply={async (preset, scope, renumberMode) => {
        if (preset === 'manual') {
          onOpenDragMode();
          return;
        }
        await onApplyOrder(preset, toRingsideScope(scope), renumberMode);
      }}
    />
  );
};
