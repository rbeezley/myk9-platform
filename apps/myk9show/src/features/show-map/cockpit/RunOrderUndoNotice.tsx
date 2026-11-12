import { Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { SecretaryCockpitRunOrderControls } from './secretaryCockpitTypes';

/** The Undo offer for the last run-order change in this class (preset or hand). */
export function RunOrderUndoNotice({
  classId,
  runOrder,
}: {
  classId: string;
  runOrder: SecretaryCockpitRunOrderControls;
}) {
  if (!runOrder.lastChange || runOrder.lastChange.classId !== classId) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
    >
      <span>{runOrder.lastChange.summary}</span>
      <Button
        type="button"
        variant="outline"
        size="touch"
        disabled={runOrder.isAutoSorting}
        onClick={runOrder.onUndo}
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" />
        Undo
      </Button>
    </div>
  );
}
