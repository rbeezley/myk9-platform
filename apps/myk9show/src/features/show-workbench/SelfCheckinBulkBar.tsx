/**
 * Self check-in tool's multi-select bar, on the shared list-toolkit
 * `FloatingBulkBar` (MYK9-812) instead of the inline `rounded-md border`
 * bar that used to sit in normal document flow above the tree.
 *
 * "Select all (N)" stays as the bar's first child alongside Enable/Disable
 * (owner decision on MYK9-812) — `OverrideTree`'s per-trial "select all"
 * checkbox reaches every class trial-by-trial, but a one-click way to select
 * every class in the show has no other equivalent once the inline bar is
 * gone.
 *
 * Enable/Disable dispatch through the same `useBulkUpdateClassOverrides`
 * mutation as before, unchanged — that path is online-only (writes
 * `class_visibility_overrides` directly via `untypedSupabase`), with no
 * offline replication path (MYK9-849 option (b)). Both buttons disable with a
 * "Needs a connection" hint while offline instead of failing after the fact.
 */
import { CheckCircle2, ListChecks, XCircle } from 'lucide-react';
import { FloatingBulkBar, BulkBarButton } from '@/components/list-toolkit';
import { useBulkUpdateClassOverrides } from '@/hooks/mutations/useShowSettingsMutations';
import { useConnectionHint } from '@/hooks/useConnectionHint';
import { toast } from 'sonner';

const CLASS_NOUN = ['class', 'classes'] as const;

interface SelfCheckinBulkBarProps {
  showId: string;
  selectedClasses: Set<string>;
  allClassIds: string[];
  onSelectAll: () => void;
  onClearSelection: () => void;
}

export function SelfCheckinBulkBar({
  showId,
  selectedClasses,
  allClassIds,
  onSelectAll,
  onClearSelection,
}: SelfCheckinBulkBarProps) {
  const updateClasses = useBulkUpdateClassOverrides();
  const connectionHint = useConnectionHint();

  if (selectedClasses.size === 0) return null;

  function updateCheckin(enabled: boolean) {
    const validIds = new Set(allClassIds);
    const classIds = Array.from(selectedClasses).filter(id => validIds.has(id));
    if (classIds.length === 0) {
      toast.warning('Those classes are no longer in this show. The selection has been cleared.');
      onClearSelection();
      return;
    }

    updateClasses.mutate(
      { classIds, showId, selfCheckinEnabled: enabled },
      {
        onSuccess: () => {
          toast.success(
            `Self check-in ${enabled ? 'enabled' : 'disabled'} for ${classIds.length} class${classIds.length === 1 ? '' : 'es'}`
          );
          onClearSelection();
        },
        onError: () => toast.error('Failed to update self check-in'),
      }
    );
  }

  const disabled = updateClasses.isPending || Boolean(connectionHint);

  return (
    <FloatingBulkBar count={selectedClasses.size} noun={CLASS_NOUN} onClear={onClearSelection}>
      <BulkBarButton
        onClick={onSelectAll}
        icon={<ListChecks className="h-4 w-4" aria-hidden="true" />}
      >
        Select all ({allClassIds.length})
      </BulkBarButton>
      <BulkBarButton
        onClick={() => updateCheckin(true)}
        disabled={disabled}
        title={connectionHint}
        icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
      >
        Enable self check-in
      </BulkBarButton>
      <BulkBarButton
        onClick={() => updateCheckin(false)}
        disabled={disabled}
        title={connectionHint}
        icon={<XCircle className="h-4 w-4" aria-hidden="true" />}
      >
        Disable self check-in
      </BulkBarButton>
      {connectionHint && (
        <span
          className="whitespace-nowrap px-2 text-xs text-muted-foreground"
          role="status"
          aria-label={`Self check-in controls: ${connectionHint}`}
        >
          {connectionHint}
        </span>
      )}
    </FloatingBulkBar>
  );
}
