import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ClassData } from './types/classTypes';
import type { ShowJudgeAssignment } from '@/types/judge-types';

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

export function RequirementsFields({
  classData,
  onFieldChange,
}: {
  classData: ClassData;
  onFieldChange: (field: string, value: string | number) => void;
}) {
  return (
    <>
      <div className="space-y-3">
        <Label htmlFor="hidesUsed" className="text-sm font-medium">
          Hides Used
        </Label>
        <Input
          id="hidesUsed"
          value={classData.hidesUsed || ''}
          onChange={e => onFieldChange('hidesUsed', e.target.value)}
          placeholder="Enter number of hides"
          className="h-11"
        />
      </div>
      <div className="space-y-3">
        <Label htmlFor="distractionsUsed" className="text-sm font-medium">
          Distractions Used
        </Label>
        <Input
          id="distractionsUsed"
          value={classData.distractionsUsed || ''}
          onChange={e => onFieldChange('distractionsUsed', e.target.value)}
          placeholder="Enter distractions"
          className="h-11"
        />
      </div>
      <div className="col-span-2 space-y-3">
        <Label htmlFor="itemsUsed" className="text-sm font-medium">
          Items Used
        </Label>
        <Input
          id="itemsUsed"
          value={classData.itemsUsed || ''}
          onChange={e => onFieldChange('itemsUsed', e.target.value)}
          placeholder="Enter items used"
          className="h-11"
        />
      </div>
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
