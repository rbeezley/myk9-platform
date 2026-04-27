import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetFooter, SheetTitle } from '@myk9/ui';
import { Button } from '@/components/ui/button';
import { TrialClass } from '@/components/trials/types/trial.types';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import { getJudgeNameById } from '@/utils/buildAssignedJudges';

interface SimpleEditFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trialClassData: TrialClass;
  assignedJudges: ShowJudgeAssignment[];
  onFieldChange: (field: string, value: string | number) => void;
  onSave: () => void;
}

const SimpleEditForm: React.FC<SimpleEditFormProps> = ({
  open,
  onOpenChange,
  trialClassData,
  assignedJudges,
  onFieldChange,
  onSave,
}) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="2xl">
        <SheetHeader>
          <SheetTitle>Edit Class</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {/* Row 1: Element, Level, Section - Read Only */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Element</Label>
              <Input
                value={trialClassData.element}
                className="form-input h-10 bg-muted text-muted-foreground"
                disabled
                readOnly
              />
            </div>
            <div className="space-y-3">
              <Label className="text-sm font-medium">Level</Label>
              <Input
                value={trialClassData.level}
                className="form-input h-10 bg-muted text-muted-foreground"
                disabled
                readOnly
              />
            </div>
            <div className="space-y-3">
              <Label className="text-sm font-medium">Section</Label>
              <Input
                value={trialClassData.section}
                className="form-input h-10 bg-muted text-muted-foreground"
                disabled
                readOnly
              />
            </div>
          </div>

          {/* Row 2: Judge, Start Time, Status */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="space-y-3">
              <Label className="flex items-center text-sm font-medium">
                Judge <span className="text-destructive ml-1">*</span>
              </Label>
              <Select
                value={trialClassData.judgeId}
                onValueChange={value => {
                  onFieldChange('judgeId', value);
                  onFieldChange('judgeName', getJudgeNameById(assignedJudges, value));
                }}
              >
                <SelectTrigger className="form-input h-10">
                  <SelectValue placeholder="Select a judge" />
                </SelectTrigger>
                <SelectContent>
                  {assignedJudges.length > 0 ? (
                    assignedJudges.map(judge => (
                      <SelectItem key={judge.judgeId} value={judge.judgeId}>
                        {judge.judgeName}
                        {judge.availableStartTime !== 'Full Day' && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ({judge.availableStartTime} - {judge.availableEndTime})
                          </span>
                        )}
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
            <div className="space-y-3">
              <Label className="flex items-center text-sm font-medium">
                Start Time <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                type="datetime-local"
                value={trialClassData.startTime}
                onChange={e => onFieldChange('startTime', e.target.value)}
                className="form-input h-10"
              />
            </div>
            <div className="space-y-3">
              <Label className="flex items-center text-sm font-medium">
                Status <span className="text-destructive ml-1">*</span>
              </Label>
              <Select
                value={trialClassData.status}
                onValueChange={value => onFieldChange('status', value)}
              >
                <SelectTrigger className="form-input h-10">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Upcoming">Upcoming</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: Number of Entries - Left Column, Read Only */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Number of Entries</Label>
              <Input
                type="number"
                value={trialClassData.entries}
                className="form-input h-10 bg-muted text-muted-foreground"
                disabled
                readOnly
              />
            </div>
            <div></div>
            <div></div>
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save Changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default SimpleEditForm;
