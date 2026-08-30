import React from 'react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ListOrdered } from 'lucide-react';
import { RowActionMenu, toRowActions, type RowAction } from '@/components/ui/RowActionMenu';
import { classActions } from '@/components/classes/classActions';
import { deriveClassLifecycleValue, shouldShowClassLifecycle } from '@/lib/status/classLifecycle';
import type { OperationalViewDensity } from '@/features/operational-views/operationalViews';

export type DbClassRow = {
  id: string;
  name: string | null;
  element: string | null;
  level: string | null;
  section: string | null;
  status: string | null;
  class_order: number | null;
  max_entries: number | null;
  entries: Array<{ id: string }> | undefined;
  judge_assignments?: Array<{ person_id: string | null }> | null;
};

export const UNASSIGNED_JUDGE_VALUE = 'TBD';

interface ClassManagementRowProps {
  cls: DbClassRow;
  entryCount?: number | null;
  selected: boolean;
  focused?: boolean;
  showId: string | undefined;
  showStatus: string | undefined;
  availableJudges: Array<{ id: string; name: string }>;
  onToggleSelect: () => void;
  onViewWaitlist: () => void;
  onStatusChange: (classId: string, status: string) => void;
  onJudgeChange: (classId: string, judgeId: string) => void;
  onDelete: (classId: string) => void;
  /**
   * Display density (Design Decision 3) — controls padding/spacing only.
   * Selection checkbox, status chip, judge assignment, and the row action
   * menu are always rendered regardless of this value.
   */
  density?: OperationalViewDensity;
}

export const ClassManagementRow: React.FC<ClassManagementRowProps> = ({
  cls,
  entryCount: canonicalEntryCount,
  selected,
  focused = false,
  showId,
  showStatus,
  availableJudges,
  onToggleSelect,
  onViewWaitlist,
  onStatusChange,
  onJudgeChange,
  onDelete,
  density = 'comfortable',
}) => {
  const entryCount =
    canonicalEntryCount === undefined ? (cls.entries?.length ?? 0) : canonicalEntryCount;
  const maxEntries = cls.max_entries ?? 0;
  const assignedJudgeId = cls.judge_assignments?.[0]?.person_id ?? null;
  // The shared `Select` wrapper now derives `items` from its SelectItem children and
  // masks an unmatched UUID generically (F34), so this override is no longer what
  // stops a raw id rendering. It is kept for the LABEL: on the page whose whole job
  // is assigning judges, "Assigned judge (unavailable)" says more than "Unavailable".
  // An explicit `items` always wins over the wrapper's derivation.
  const judgeItems = React.useMemo(() => {
    const items: Record<string, React.ReactNode> = { [UNASSIGNED_JUDGE_VALUE]: 'Unassigned' };
    for (const judge of availableJudges) items[judge.id] = judge.name;
    // A judge can be assigned and yet absent from `availableJudges` -- the list is
    // filtered to active qualifications and is empty while it loads or fails. Give
    // that value a label too, or it falls straight back to rendering the raw id.
    if (assignedJudgeId && !(assignedJudgeId in items)) {
      items[assignedJudgeId] = 'Assigned judge (unavailable)';
    }
    return items;
  }, [availableJudges, assignedJudgeId]);
  const isCompact = density === 'compact';
  return (
    <div
      id={`class-management-row-${cls.id}`}
      data-class-id={cls.id}
      data-class-focused={focused || undefined}
      tabIndex={-1}
      className={`border rounded-lg transition-all ${isCompact ? 'p-2' : 'p-4'} ${
        selected
          ? 'ring-2 ring-primary bg-primary/5'
          : focused
            ? 'ring-2 ring-accent-foreground/40 bg-accent/20'
            : 'hover:bg-muted/50'
      }`}
    >
      <div className="flex items-center gap-4">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect()}
          aria-label={`Select ${cls.name || 'Untitled Class'}`}
        />

        <div className="manager-class-row-grid flex-1">
          <div className="manager-class-name">
            <div className="font-medium">{cls.name || 'Untitled Class'}</div>
            {cls.class_order != null && (
              <div className="text-sm text-muted-foreground">Order: {cls.class_order}</div>
            )}
          </div>

          <div className="flex flex-wrap gap-1">
            {cls.element && <Badge variant="outline">{cls.element}</Badge>}
            {cls.level && <Badge variant="secondary">{cls.level}</Badge>}
            {cls.section && <Badge variant="outline">{cls.section}</Badge>}
          </div>

          {(() => {
            // Derived lifecycle chip: one label per stage
            // ("Not started" / "In Progress" / "Completed"),
            // never the raw enum ("in_progress") or "No Status".
            // Draft/unpublished shows render no chip at all
            // (UX walk remediation 2.B).
            if (!shouldShowClassLifecycle(showStatus)) return null;
            const lifecycleValue = deriveClassLifecycleValue(cls.status);
            return (
              <StatusBadge
                family="class"
                status={lifecycleValue}
                className="rounded-full bg-muted/40 px-2 py-1 text-xs font-medium"
              />
            );
          })()}

          <div className="text-sm text-muted-foreground">
            {entryCount === null ? (
              <div aria-label="Entry count unavailable">Entries: —</div>
            ) : (
              <div>
                Entries: {entryCount}
                {maxEntries > 0 ? `/${maxEntries}` : ''}
              </div>
            )}
          </div>

          <div>
            <Select
              items={judgeItems}
              value={assignedJudgeId ?? UNASSIGNED_JUDGE_VALUE}
              onValueChange={judgeId => onJudgeChange(cls.id, judgeId)}
              // Stay usable while there is something to CLEAR. Narrowing the list to
              // the show's registry can legitimately empty it while a class still
              // records an ineligible judge (wrong organization, or a lapsed
              // qualification), and disabling on an empty list then strands that
              // assignment: "Unassigned" is the only way out and it sits inside this
              // control. `judgeItems` already labels an assigned-but-unavailable judge.
              disabled={!showId || (availableJudges.length === 0 && !assignedJudgeId)}
            >
              <SelectTrigger
                className="w-full"
                aria-label={`Judge for ${cls.name || 'Untitled Class'}`}
              >
                <SelectValue placeholder="Assign judge" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED_JUDGE_VALUE}>Unassigned</SelectItem>
                {availableJudges.map(judge => (
                  <SelectItem key={judge.id} value={judge.id}>
                    {judge.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-1">
            <RowActionMenu
              align="end"
              label={`More actions for ${cls.name || 'Untitled Class'}`}
              actions={[
                {
                  id: 'view-waitlist',
                  label: 'View waitlist',
                  icon: <ListOrdered className="h-4 w-4" />,
                  onSelect: () => onViewWaitlist(),
                } as RowAction,
                // Status + delete resolve from the SAME shared catalog
                // the bulk bar uses (toRowActions), so row and bulk
                // eligibility/handlers can't diverge. Row delete keeps
                // its confirm() via handleDelete.
                ...toRowActions(
                  { id: cls.id, name: cls.name, status: cls.status },
                  { onStatusChange, onDelete },
                  classActions
                ),
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
