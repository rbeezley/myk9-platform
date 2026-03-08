import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BookOpen } from 'lucide-react';
import { ClassData } from './types/classTypes';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { ClassRequirementsAutoFill } from '@/hooks/useClassRequirements';

interface PersonOption {
  id: string;
  firstName: string;
  lastName: string;
}

function StewardSelect({
  id,
  label,
  value,
  people,
  onFieldChange,
}: {
  id: string;
  label: string;
  value: string | undefined;
  people: PersonOption[];
  onFieldChange: (field: string, value: string | number) => void;
}) {
  return (
    <div className="space-y-3">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <Select value={value || 'none'} onValueChange={v => onFieldChange(id, v)}>
        <SelectTrigger id={id} className="h-11">
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {people.map(person => (
            <SelectItem key={person.id} value={`${person.firstName} ${person.lastName}`}>
              {person.firstName} {person.lastName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function OfficialsFields({
  classData,
  assignedJudges,
  people,
  onFieldChange,
}: {
  classData: ClassData;
  assignedJudges: ShowJudgeAssignment[];
  people: PersonOption[];
  onFieldChange: (field: string, value: string | number) => void;
}) {
  return (
    <>
      <div className="col-span-2 space-y-3">
        <Label htmlFor="judge" className="text-sm font-medium">
          Judge
        </Label>
        <Select value={classData.judge || ''} onValueChange={v => onFieldChange('judge', v)}>
          <SelectTrigger id="judge" className="h-11">
            <SelectValue placeholder="Select a judge" />
          </SelectTrigger>
          <SelectContent>
            {assignedJudges.length > 0 ? (
              assignedJudges.map(judge => (
                <SelectItem key={judge.judgeId} value={judge.judgeName}>
                  {judge.judgeName}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="TBD" disabled>
                No judges assigned to this show
              </SelectItem>
            )}
            <SelectItem value="TBD">TBD</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <StewardSelect
        id="gateSteward"
        label="Gate Steward"
        value={classData.gateSteward}
        people={people}
        onFieldChange={onFieldChange}
      />
      <StewardSelect
        id="tableSteward"
        label="Table Steward"
        value={classData.tableSteward}
        people={people}
        onFieldChange={onFieldChange}
      />
      <StewardSelect
        id="timerSteward"
        label="Timer Steward"
        value={classData.timerSteward}
        people={people}
        onFieldChange={onFieldChange}
      />
      <StewardSelect
        id="ringSteward1"
        label="Ring Steward 1"
        value={classData.ringSteward1}
        people={people}
        onFieldChange={onFieldChange}
      />
      <StewardSelect
        id="ringSteward2"
        label="Ring Steward 2"
        value={classData.ringSteward2}
        people={people}
        onFieldChange={onFieldChange}
      />
      <StewardSelect
        id="ringSteward3"
        label="Ring Steward 3"
        value={classData.ringSteward3}
        people={people}
        onFieldChange={onFieldChange}
      />
    </>
  );
}

/** Badge shown next to rule-sourced fields */
/** Badge shown next to rule-sourced fields */
export function RuleBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary/70 bg-primary/5 border border-primary/10 rounded px-1.5 py-0.5 ml-2">
      <BookOpen className="h-3 w-3" />
      {label}
    </span>
  );
}

/** A requirement input field with optional auto-fill from rules */
function RequirementInput({
  id,
  label,
  value,
  ruleValue,
  isJudgeSettable,
  placeholder,
  onChange,
  colSpan,
}: {
  id: string;
  label: string;
  value: string;
  ruleValue?: string | undefined;
  isJudgeSettable?: boolean | undefined;
  placeholder: string;
  onChange: (value: string) => void;
  colSpan?: number | undefined;
}) {
  const hasRuleValue = ruleValue !== undefined && ruleValue !== '';
  const isAutoFilled = hasRuleValue && !isJudgeSettable && !value;

  return (
    <div className={`space-y-3${colSpan ? ` col-span-${colSpan}` : ''}`}>
      <Label htmlFor={id} className="text-sm font-medium flex items-center">
        {label}
        {hasRuleValue && !isJudgeSettable && <RuleBadge label="From rules" />}
        {isJudgeSettable && <RuleBadge label="Judge sets" />}
      </Label>
      <Input
        id={id}
        value={isAutoFilled ? ruleValue : value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`h-11 ${isAutoFilled ? 'bg-primary/[0.03] text-muted-foreground border-primary/20' : ''}`}
        readOnly={hasRuleValue && !isJudgeSettable}
      />
    </div>
  );
}

export function RequirementsFields({
  classData,
  onFieldChange,
  autoFill,
}: {
  classData: ClassData;
  onFieldChange: (field: string, value: string | number) => void;
  autoFill?: ClassRequirementsAutoFill | null | undefined;
}) {
  return (
    <>
      <RequirementInput
        id="hidesUsed"
        label="Hides Used"
        value={classData.hidesUsed || ''}
        ruleValue={autoFill?.hidesUsed.ruleValue}
        isJudgeSettable={autoFill?.hidesUsed.isJudgeSettable}
        placeholder={autoFill?.hidesUsed.placeholder || 'Enter number of hides'}
        onChange={v => onFieldChange('hidesUsed', v)}
      />
      <RequirementInput
        id="distractionsUsed"
        label="Distractions Used"
        value={classData.distractionsUsed || ''}
        ruleValue={autoFill?.distractionsUsed.ruleValue}
        isJudgeSettable={autoFill?.distractionsUsed.isJudgeSettable}
        placeholder={autoFill?.distractionsUsed.placeholder || 'Enter distractions'}
        onChange={v => onFieldChange('distractionsUsed', v)}
      />
      <RequirementInput
        id="itemsUsed"
        label="Items Used"
        value={classData.itemsUsed || ''}
        ruleValue={autoFill?.itemsUsed.ruleValue}
        isJudgeSettable={autoFill?.itemsUsed.isJudgeSettable}
        placeholder={autoFill?.itemsUsed.placeholder || 'Enter items used'}
        onChange={v => onFieldChange('itemsUsed', v)}
        colSpan={2}
      />
    </>
  );
}

export function FeeFields({
  classData,
  onFieldChange,
}: {
  classData: ClassData;
  onFieldChange: (field: string, value: string | number) => void;
}) {
  return (
    <>
      <div className="space-y-3">
        <Label htmlFor="preEntryFee" className="text-sm font-medium">
          Pre Entry Fee ($)
        </Label>
        <Input
          id="preEntryFee"
          value={classData.preEntryFee || ''}
          onChange={e => onFieldChange('preEntryFee', parseFloat(e.target.value) || 0)}
          placeholder="Enter pre entry fee"
          type="number"
          min="0"
          step="0.01"
          className="h-11"
        />
      </div>
      <div className="space-y-3">
        <Label htmlFor="dayOfShowFee" className="text-sm font-medium">
          Day of Show Fee ($)
        </Label>
        <Input
          id="dayOfShowFee"
          value={classData.dayOfShowFee || ''}
          onChange={e => onFieldChange('dayOfShowFee', parseFloat(e.target.value) || 0)}
          placeholder="Enter day of show fee"
          type="number"
          min="0"
          step="0.01"
          className="h-11"
        />
      </div>
    </>
  );
}
