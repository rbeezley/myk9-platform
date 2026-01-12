import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TimePicker } from '@/components/ui/time-picker';
import { AppleDialog } from '@/components/ui/AppleDialog';
import { Clock, UserCheck, ClipboardList, DollarSign } from 'lucide-react';
import { ClassData } from './types/classTypes';
import { TrialClass } from '@/components/trials/types/trial.types';
import { useShowStore } from '@/store/showStore';
import { useUserStore } from '@/store/userStore';
import { useTrialStore } from '@/store/trialStore';
import ExpandableSection from './ExpandableSection';
import SectionToggleControls from './SectionToggleControls';
import { logger } from '@/services/LoggingService';

interface EditClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updatedClass: ClassData | TrialClass) => void;
  classItem: ClassData | TrialClass | null;
  showId?: string;
  mode?: 'full' | 'simple'; // 'full' for ClassData with tabs, 'simple' for TrialClass
}

const EditClassDialog: React.FC<EditClassDialogProps> = ({
  open,
  onOpenChange,
  onSave,
  classItem,
  showId,
  mode = 'full'
}) => {
  const [formData, setFormData] = useState<ClassData | TrialClass | null>(null);
  const { shows } = useShowStore();
  const { people } = useUserStore();
  const { trials } = useTrialStore();

  // State for section controls - must be declared before any early returns
  const [forceExpandAll, setForceExpandAll] = useState<boolean | undefined>(undefined);
  const [forceCollapseAll, setForceCollapseAll] = useState<boolean | undefined>(undefined);

  // Get assigned judges based on the class type and context
  const getAssignedJudges = () => {
    if (showId) {
      // For TrialClass mode - get judges from specific show
      const currentShow = shows.find(show => show.id === showId);
      return currentShow?.assignedJudges || [];
    } else if ('trialId' in (classItem || {})) {
      // For ClassData mode - get judges from trial's show
      const classData = classItem as ClassData;
      const currentTrial = trials.find(t => t.id === classData.trialId);
      const currentShow = currentTrial ? shows.find(s => s.id === currentTrial.showId) : null;
      return currentShow?.assignedJudges || [];
    }
    return [];
  };

  const assignedJudges = getAssignedJudges();

  useEffect(() => {
    if (classItem) {
      // Convert date format for datetime-local input if needed
      const processedItem = { ...classItem };
      
      if ('startTime' in classItem && classItem.startTime && !classItem.startTime.includes('T')) {
        try {
          const date = new Date(classItem.startTime);
          if (!isNaN(date.getTime())) {
            processedItem.startTime = date.toISOString().slice(0, 16);
          }
        } catch (e) {
          logger.warn('Failed to convert startTime:', 'classes', {}, e as Error);
        }
      }
      
      setFormData(processedItem);
    }
  }, [classItem]);

  const handleChange = (field: string, value: string | number) => {
    const finalValue = value === 'none' ? '' : value;
    setFormData(prev => prev ? { ...prev, [field]: finalValue } : null);
  };

  const handleSave = () => {
    if (formData) {
      onSave(formData);
      onOpenChange(false);
    }
  };

  if (!formData) return null;

  // Simple mode for TrialClass
  if (mode === 'simple' || ('judgeId' in formData && !('estimatedJudgingTime' in formData))) {
    const trialClassData = formData as TrialClass;
    return (
      <AppleDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Edit Class"
        onSave={handleSave}
        saveLabel="Save Changes"
        maxWidth="6xl"
      >
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
              onValueChange={(value) => {
                const selectedJudge = assignedJudges.find(judge => judge.judgeId === value);
                handleChange('judgeId', value);
                handleChange('judgeName', selectedJudge?.judgeName || 'TBD');
              }}
            >
              <SelectTrigger className="form-input h-10">
                <SelectValue placeholder="Select a judge" />
              </SelectTrigger>
              <SelectContent>
                {assignedJudges.length > 0 ? (
                  assignedJudges.map((judge) => (
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
              onChange={(e) => handleChange('startTime', e.target.value)}
              className="form-input h-10"
            />
          </div>
          <div className="space-y-3">
            <Label className="flex items-center text-sm font-medium">
              Status <span className="text-destructive ml-1">*</span>
            </Label>
            <Select
              value={trialClassData.status}
              onValueChange={(value) => handleChange('status', value)}
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
      </AppleDialog>
    );
  }

  // Full mode for ClassData with expandable sections
  const classData = formData as ClassData;
  
  // Content counting for sections (same logic as ClassDetailsMain)
  const countPopulatedFields = (fields: (string | number | boolean | undefined)[]): number => {
    return fields.filter(field => 
      field !== undefined && 
      field !== null && 
      field !== '' && 
      // For booleans, only count 'true' values since we only show them when true
      (typeof field === 'boolean' ? field === true : field !== 0)
    ).length;
  };

  const timingFieldsCount = countPopulatedFields([
    classData.estimatedJudgingTime,
    classData.timeLimit1,
    classData.timeLimit2,
    classData.timeLimit3
  ]);

  const officialsFieldsCount = countPopulatedFields([
    classData.judge,
    classData.gateSteward,
    classData.tableSteward,
    classData.timerSteward,
    classData.ringSteward1,
    classData.ringSteward2,
    classData.ringSteward3
  ]);

  const requirementsFieldsCount = countPopulatedFields([
    classData.hidesUsed,
    classData.distractionsUsed,
    classData.itemsUsed
  ]);

  const feesFieldsCount = countPopulatedFields([
    classData.preEntryFee,
    classData.dayOfShowFee
  ]);

  // Toggle functions for section controls
  const handleExpandAll = () => {
    setForceCollapseAll(undefined);
    setForceExpandAll(true);
    setTimeout(() => setForceExpandAll(undefined), 200);
  };

  const handleCollapseAll = () => {
    setForceExpandAll(undefined);
    setForceCollapseAll(true);
    setTimeout(() => setForceCollapseAll(undefined), 200);
  };

  return (
    <AppleDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Class"
      onSave={handleSave}
      saveLabel="Save Changes"
      maxWidth="6xl"
    >
      {/* Scrollable container for content */}
      <div className="max-h-[70vh] overflow-y-auto pr-2">
        {/* Essential Fields - Always Visible */}
        <div className="space-y-6">
        {/* Element, Level, Section */}
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-3">
            <Label htmlFor="element" className="flex items-center text-sm font-medium">
              Element <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              id="element"
              value={classData.element || ""}
              onChange={e => handleChange('element', e.target.value)}
              placeholder="Enter element name"
              required
              className="h-11 bg-muted text-muted-foreground cursor-not-allowed"
              readOnly
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="level" className="flex items-center text-sm font-medium">
              Level <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              id="level"
              value={classData.level || ""}
              onChange={e => handleChange('level', e.target.value)}
              placeholder="Enter level"
              required
              className="h-11 bg-muted text-muted-foreground cursor-not-allowed"
              readOnly
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="section" className="flex items-center text-sm font-medium">
              Section
            </Label>
            <Input
              id="section"
              value={classData.section || ""}
              onChange={e => handleChange('section', e.target.value)}
              placeholder="Enter section"
              className="h-11 bg-muted text-muted-foreground cursor-not-allowed"
              readOnly
            />
          </div>
        </div>

        {/* Class Order and Class Status */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <Label htmlFor="classOrder" className="text-sm font-medium">
              Class Order
            </Label>
            <Input
              id="classOrder"
              value={classData.classOrder || ""}
              onChange={e => handleChange('classOrder', e.target.value)}
              placeholder="Enter order number"
              className="h-11"
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="status" className="text-sm font-medium">
              Class Status
            </Label>
            <Select 
              value={classData.status || ""} 
              onValueChange={(value) => handleChange('status', value)}
            >
              <SelectTrigger id="status" className="h-11">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Scheduled">Scheduled</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Section Controls */}
        <div className="flex justify-end">
          <SectionToggleControls
            onExpandAll={handleExpandAll}
            onCollapseAll={handleCollapseAll}
          />
        </div>

        {/* Expandable Sections */}
        <div className="space-y-3">
          {/* Timing Details Section - Utility */}
          <ExpandableSection
            title="Timing Details"
            icon={<Clock className="h-4 w-4" />}
            contentCount={Math.max(timingFieldsCount, 1)} // Always show in edit mode
            storageKey="edit-timing"
            priority="utility"
            forceExpanded={forceExpandAll}
            forceCollapsed={forceCollapseAll}
          >
            {/* Estimated Judging Time */}
            <div className="col-span-2">
              <TimePicker
                id="estimatedJudgingTime"
                label="Estimated Judging Time"
                value={classData.estimatedJudgingTime || ""}
                onChange={value => handleChange('estimatedJudgingTime', value)}
                maxMinutes={classData.element === 'Detective' ? 15 : 9}
              />
            </div>

            {/* Time Limits */}
            <div className="col-span-2 space-y-3">
              {/* Always show Time Limit 1 */}
              <TimePicker
                id="timeLimit1"
                label="Time Limit 1"
                value={classData.timeLimit1 || ""}
                onChange={value => handleChange('timeLimit1', value)}
                maxMinutes={classData.element === 'Detective' ? 15 : 9}
              />

              {/* Time Limit 2 - Show only for Interior Excellent or Master */}
              {classData.element === 'Interior' && (classData.level === 'Excellent' || classData.level === 'Master') && (
                <TimePicker
                  id="timeLimit2"
                  label="Time Limit 2"
                  value={classData.timeLimit2 || ""}
                  onChange={value => handleChange('timeLimit2', value)}
                  maxMinutes={9}
                />
              )}

              {/* Time Limit 3 - Show only for Interior Master */}
              {classData.element === 'Interior' && classData.level === 'Master' && (
                <TimePicker
                  id="timeLimit3"
                  label="Time Limit 3"
                  value={classData.timeLimit3 || ""}
                  onChange={value => handleChange('timeLimit3', value)}
                  maxMinutes={9}
                />
              )}
            </div>
          </ExpandableSection>
          {/* Officials Section - Important */}
          <ExpandableSection
            title="Officials"
            icon={<UserCheck className="h-4 w-4" />}
            contentCount={Math.max(officialsFieldsCount, 1)} // Always show in edit mode
            storageKey="edit-officials"
            priority="important"
            forceExpanded={forceExpandAll}
            forceCollapsed={forceCollapseAll}
          >
            {/* Judge */}
            <div className="col-span-2 space-y-3">
              <Label htmlFor="judge" className="text-sm font-medium">
                Judge
              </Label>
              <Select 
                value={classData.judge || ""} 
                onValueChange={(value) => handleChange('judge', value)}
              >
                <SelectTrigger id="judge" className="h-11">
                  <SelectValue placeholder="Select a judge" />
                </SelectTrigger>
                <SelectContent>
                  {assignedJudges.length > 0 ? (
                    assignedJudges.map((judge) => (
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

            {/* Gate Steward */}
            <div className="space-y-3">
              <Label htmlFor="gateSteward" className="text-sm font-medium">
                Gate Steward
              </Label>
              <Select 
                value={classData.gateSteward || "none"} 
                onValueChange={(value) => handleChange('gateSteward', value)}
              >
                <SelectTrigger id="gateSteward" className="h-11">
                  <SelectValue placeholder="Select gate steward" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={`${person.firstName} ${person.lastName}`}>
                      {person.firstName} {person.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Table Steward */}
            <div className="space-y-3">
              <Label htmlFor="tableSteward" className="text-sm font-medium">
                Table Steward
              </Label>
              <Select 
                value={classData.tableSteward || "none"} 
                onValueChange={(value) => handleChange('tableSteward', value)}
              >
                <SelectTrigger id="tableSteward" className="h-11">
                  <SelectValue placeholder="Select table steward" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={`${person.firstName} ${person.lastName}`}>
                      {person.firstName} {person.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Timer Steward */}
            <div className="space-y-3">
              <Label htmlFor="timerSteward" className="text-sm font-medium">
                Timer Steward
              </Label>
              <Select 
                value={classData.timerSteward || "none"} 
                onValueChange={(value) => handleChange('timerSteward', value)}
              >
                <SelectTrigger id="timerSteward" className="h-11">
                  <SelectValue placeholder="Select timer steward" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={`${person.firstName} ${person.lastName}`}>
                      {person.firstName} {person.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Ring Steward 1 */}
            <div className="space-y-3">
              <Label htmlFor="ringSteward1" className="text-sm font-medium">
                Ring Steward 1
              </Label>
              <Select 
                value={classData.ringSteward1 || "none"} 
                onValueChange={(value) => handleChange('ringSteward1', value)}
              >
                <SelectTrigger id="ringSteward1" className="h-11">
                  <SelectValue placeholder="Select ring steward 1" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={`${person.firstName} ${person.lastName}`}>
                      {person.firstName} {person.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Ring Steward 2 */}
            <div className="space-y-3">
              <Label htmlFor="ringSteward2" className="text-sm font-medium">
                Ring Steward 2
              </Label>
              <Select 
                value={classData.ringSteward2 || "none"} 
                onValueChange={(value) => handleChange('ringSteward2', value)}
              >
                <SelectTrigger id="ringSteward2" className="h-11">
                  <SelectValue placeholder="Select ring steward 2" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={`${person.firstName} ${person.lastName}`}>
                      {person.firstName} {person.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Ring Steward 3 */}
            <div className="space-y-3">
              <Label htmlFor="ringSteward3" className="text-sm font-medium">
                Ring Steward 3
              </Label>
              <Select 
                value={classData.ringSteward3 || "none"} 
                onValueChange={(value) => handleChange('ringSteward3', value)}
              >
                <SelectTrigger id="ringSteward3" className="h-11">
                  <SelectValue placeholder="Select ring steward 3" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={`${person.firstName} ${person.lastName}`}>
                      {person.firstName} {person.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </ExpandableSection>
          {/* Requirements Section - Important */}
          <ExpandableSection
            title="Requirements"
            icon={<ClipboardList className="h-4 w-4" />}
            contentCount={Math.max(requirementsFieldsCount, 1)} // Always show in edit mode
            storageKey="edit-requirements"
            priority="important"
            forceExpanded={forceExpandAll}
            forceCollapsed={forceCollapseAll}
          >
            {/* Hides Used */}
            <div className="space-y-3">
              <Label htmlFor="hidesUsed" className="text-sm font-medium">
                Hides Used
              </Label>
              <Input
                id="hidesUsed"
                value={classData.hidesUsed || ""}
                onChange={e => handleChange('hidesUsed', e.target.value)}
                placeholder="Enter number of hides"
                className="h-11"
              />
            </div>

            {/* Distractions Used */}
            <div className="space-y-3">
              <Label htmlFor="distractionsUsed" className="text-sm font-medium">
                Distractions Used
              </Label>
              <Input
                id="distractionsUsed"
                value={classData.distractionsUsed || ""}
                onChange={e => handleChange('distractionsUsed', e.target.value)}
                placeholder="Enter distractions"
                className="h-11"
              />
            </div>

            {/* Items Used */}
            <div className="col-span-2 space-y-3">
              <Label htmlFor="itemsUsed" className="text-sm font-medium">
                Items Used
              </Label>
              <Input
                id="itemsUsed"
                value={classData.itemsUsed || ""}
                onChange={e => handleChange('itemsUsed', e.target.value)}
                placeholder="Enter items used"
                className="h-11"
              />
            </div>
          </ExpandableSection>

          {/* Fee Structure Section - Utility - Always show in edit mode */}
          <ExpandableSection
            title="Fee Structure"
            icon={<DollarSign className="h-4 w-4" />}
            contentCount={Math.max(feesFieldsCount, 1)} // Always show in edit mode
            storageKey="edit-fees"
            priority="utility"
            forceExpanded={forceExpandAll}
            forceCollapsed={forceCollapseAll}
          >
            {/* Pre Entry Fee */}
            <div className="space-y-3">
              <Label htmlFor="preEntryFee" className="text-sm font-medium">
                Pre Entry Fee ($)
              </Label>
              <Input
                id="preEntryFee"
                value={classData.preEntryFee || ""}
                onChange={e => handleChange('preEntryFee', parseFloat(e.target.value) || 0)}
                placeholder="Enter pre entry fee"
                type="number"
                min="0"
                step="0.01"
                className="h-11"
              />
            </div>

            {/* Day of Show Fee */}
            <div className="space-y-3">
              <Label htmlFor="dayOfShowFee" className="text-sm font-medium">
                Day of Show Fee ($)
              </Label>
              <Input
                id="dayOfShowFee"
                value={classData.dayOfShowFee || ""}
                onChange={e => handleChange('dayOfShowFee', parseFloat(e.target.value) || 0)}
                placeholder="Enter day of show fee"
                type="number"
                min="0"
                step="0.01"
                className="h-11"
              />
            </div>
          </ExpandableSection>
        </div>
        </div>
      </div>
    </AppleDialog>
  );
};

export default EditClassDialog;