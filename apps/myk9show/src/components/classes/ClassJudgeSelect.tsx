import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const UNASSIGNED_JUDGE_VALUE = 'TBD';

interface ClassJudgeSelectProps {
  classId: string;
  /** The class's display name, for the control's accessible label. */
  classLabel: string;
  assignedJudgeId: string | null;
  availableJudges: Array<{ id: string; name: string }>;
  /** False when the show is unknown, so no assignment can be written. */
  canAssign: boolean;
  onJudgeChange: (classId: string, judgeId: string) => void;
}

/**
 * The per-class judge picker (moved out of the retired Class Management row so
 * Setup → Classes uses the same control).
 */
export const ClassJudgeSelect: React.FC<ClassJudgeSelectProps> = ({
  classId,
  classLabel,
  assignedJudgeId,
  availableJudges,
  canAssign,
  onJudgeChange,
}) => {
  // The shared `Select` wrapper derives `items` from its SelectItem children and masks an
  // unmatched UUID generically (F34), so this override is no longer what stops a raw id
  // rendering. It is kept for the LABEL: "Assigned judge (unavailable)" says more than
  // "Unavailable". An explicit `items` always wins over the wrapper's derivation.
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

  return (
    <Select
      items={judgeItems}
      value={assignedJudgeId ?? UNASSIGNED_JUDGE_VALUE}
      onValueChange={judgeId => onJudgeChange(classId, judgeId)}
      // Stay usable while there is something to CLEAR. Narrowing the list to the show's
      // registry can legitimately empty it while a class still records an ineligible judge
      // (wrong organization, or a lapsed qualification), and disabling on an empty list then
      // strands that assignment: "Unassigned" is the only way out and it sits inside this
      // control. `judgeItems` already labels an assigned-but-unavailable judge.
      disabled={!canAssign || (availableJudges.length === 0 && !assignedJudgeId)}
    >
      <SelectTrigger className="w-full" aria-label={`Judge for ${classLabel}`}>
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
  );
};
