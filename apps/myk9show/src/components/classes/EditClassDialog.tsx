import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TimePicker } from '@/components/ui/time-picker';
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetFooter, SheetTitle } from '@myk9/ui';
import { Button } from '@/components/ui/button';
import { Clock, UserCheck, ClipboardList, DollarSign } from 'lucide-react';
import { ClassData } from './types/classTypes';
import { TrialClass } from '@/components/trials/types/trial.types';
import { useShowStore } from '@/store/showStore';
import { useUserStore } from '@/store/userStore';
import { useTrialStore } from '@/store/trialStore';
import { useClassRequirements } from '@/hooks/useClassRequirements';
import ExpandableSection from './ExpandableSection';
import SectionToggleControls from './SectionToggleControls';
import SimpleEditForm from './SimpleEditForm';
import { OfficialsFields, RequirementsFields, FeeFields } from './OfficialsSection';
import type { EditClassDialogProps } from './EditClassDialog.types';
import {
  processClassItem,
  countTimingFields,
  countOfficialsFields,
  countRequirementsFields,
  countFeesFields,
} from './EditClassDialog.helpers';

const EditClassDialog: React.FC<EditClassDialogProps> = ({
  open,
  onOpenChange,
  onSave,
  classItem,
  showId,
  mode = 'full',
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
      const currentShow = shows.find(show => show.id === showId);
      return currentShow?.assignedJudges || [];
    } else if ('trialId' in (classItem || {})) {
      const classData = classItem as ClassData;
      const currentTrial = trials.find(t => t.id === classData.trialId);
      const currentShow = currentTrial ? shows.find(s => s.id === currentTrial.showId) : null;
      return currentShow?.assignedJudges || [];
    }
    return [];
  };

  const assignedJudges = getAssignedJudges();

  // Resolve show ID from trial chain if not directly provided
  const resolvedShowId = useMemo(() => {
    if (showId) return showId;
    if ('trialId' in (classItem || {})) {
      const cd = classItem as ClassData;
      const trial = trials.find(t => t.id === cd.trialId);
      return trial ? shows.find(s => s.id === trial.showId)?.id : undefined;
    }
    return undefined;
  }, [showId, classItem, trials, shows]);
  const { autoFill: requirementsAutoFill } = useClassRequirements({
    element: classItem?.element || '',
    level: classItem?.level || '',
    showId: resolvedShowId,
  });

  // Track classItem changes and update form data during render
  const classItemKey = classItem?.id || '';
  const [lastClassItemKey, setLastClassItemKey] = useState(classItemKey);
  if (classItemKey !== lastClassItemKey) {
    setLastClassItemKey(classItemKey);
    setFormData(processClassItem(classItem));
  }

  const handleChange = (field: string, value: string | number) => {
    const finalValue = value === 'none' ? '' : value;
    setFormData(prev => (prev ? { ...prev, [field]: finalValue } : null));
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
    return (
      <SimpleEditForm
        open={open}
        onOpenChange={onOpenChange}
        trialClassData={formData as TrialClass}
        assignedJudges={assignedJudges}
        onFieldChange={handleChange}
        onSave={handleSave}
      />
    );
  }

  // Full mode for ClassData with expandable sections
  const classData = formData as ClassData;

  const timingFieldsCount = countTimingFields(classData);
  const officialsFieldsCount = countOfficialsFields(classData);
  const requirementsFieldsCount = countRequirementsFields(classData);
  const feesFieldsCount = countFeesFields(classData);

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="2xl">
        <SheetHeader>
          <SheetTitle>Edit Class</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {/* Essential Fields - Always Visible */}
          <div className="space-y-6">
            {/* Element, Level, Section */}
            <div className="grid grid-cols-3 gap-6">
              <FormField label="Element" fieldId="element" required>
                <Input
                  id="element"
                  value={classData.element || ''}
                  onChange={e => handleChange('element', e.target.value)}
                  placeholder="Enter element name"
                  required
                  className="h-11 bg-muted text-muted-foreground cursor-not-allowed"
                  readOnly
                />
              </FormField>

              <FormField label="Level" fieldId="level" required>
                <Input
                  id="level"
                  value={classData.level || ''}
                  onChange={e => handleChange('level', e.target.value)}
                  placeholder="Enter level"
                  required
                  className="h-11 bg-muted text-muted-foreground cursor-not-allowed"
                  readOnly
                />
              </FormField>

              <FormField label="Section" fieldId="section">
                <Input
                  id="section"
                  value={classData.section || ''}
                  onChange={e => handleChange('section', e.target.value)}
                  placeholder="Enter section"
                  className="h-11 bg-muted text-muted-foreground cursor-not-allowed"
                  readOnly
                />
              </FormField>
            </div>

            {/* Class Order and Class Status */}
            <div className="grid grid-cols-2 gap-6">
              <FormField label="Class Order" fieldId="classOrder">
                <Input
                  id="classOrder"
                  value={classData.classOrder || ''}
                  onChange={e => handleChange('classOrder', e.target.value)}
                  placeholder="Enter order number"
                  className="h-11"
                />
              </FormField>

              <FormField label="Class Status" fieldId="status">
                <Select
                  value={classData.status || ''}
                  onValueChange={value => handleChange('status', value)}
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
              </FormField>
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
              {/* Timing Details Section */}
              <ExpandableSection
                title="Timing Details"
                icon={<Clock className="h-4 w-4" />}
                contentCount={Math.max(timingFieldsCount, 1)}
                storageKey="edit-timing"
                priority="utility"
                forceExpanded={forceExpandAll}
                forceCollapsed={forceCollapseAll}
              >
                <div className="col-span-2">
                  <TimePicker
                    id="estimatedJudgingTime"
                    label="Estimated Judging Time"
                    value={classData.estimatedJudgingTime || ''}
                    onChange={value => handleChange('estimatedJudgingTime', value)}
                    maxMinutes={classData.element === 'Detective' ? 15 : 9}
                  />
                </div>
                <div className="col-span-2 space-y-3">
                  {requirementsAutoFill?.timeLimitText.ruleValue && (
                    <div className="flex items-center gap-1 text-[10px] font-medium text-primary/70 bg-primary/5 border border-primary/10 rounded px-2 py-1 w-fit">
                      <ClipboardList className="h-3 w-3" />
                      {requirementsAutoFill.timeLimitText.isJudgeSettable
                        ? `Set by judge (${requirementsAutoFill.timeLimitText.ruleValue})`
                        : `Rule: ${requirementsAutoFill.timeLimitText.ruleValue}`}
                    </div>
                  )}
                  <TimePicker
                    id="timeLimit1"
                    label="Time Limit 1"
                    value={classData.timeLimit1 || ''}
                    onChange={value => handleChange('timeLimit1', value)}
                    maxMinutes={classData.element === 'Detective' ? 15 : 9}
                  />
                  {classData.element === 'Interior' &&
                    (classData.level === 'Excellent' || classData.level === 'Master') && (
                      <TimePicker
                        id="timeLimit2"
                        label="Time Limit 2"
                        value={classData.timeLimit2 || ''}
                        onChange={value => handleChange('timeLimit2', value)}
                        maxMinutes={9}
                      />
                    )}
                  {classData.element === 'Interior' && classData.level === 'Master' && (
                    <TimePicker
                      id="timeLimit3"
                      label="Time Limit 3"
                      value={classData.timeLimit3 || ''}
                      onChange={value => handleChange('timeLimit3', value)}
                      maxMinutes={9}
                    />
                  )}
                </div>
              </ExpandableSection>

              {/* Officials Section */}
              <ExpandableSection
                title="Officials"
                icon={<UserCheck className="h-4 w-4" />}
                contentCount={Math.max(officialsFieldsCount, 1)}
                storageKey="edit-officials"
                priority="important"
                forceExpanded={forceExpandAll}
                forceCollapsed={forceCollapseAll}
              >
                <OfficialsFields
                  classData={classData}
                  assignedJudges={assignedJudges}
                  people={people}
                  onFieldChange={handleChange}
                />
              </ExpandableSection>

              {/* Requirements Section */}
              <ExpandableSection
                title="Requirements"
                icon={<ClipboardList className="h-4 w-4" />}
                contentCount={Math.max(requirementsFieldsCount, 1)}
                storageKey="edit-requirements"
                priority="important"
                forceExpanded={forceExpandAll}
                forceCollapsed={forceCollapseAll}
              >
                <RequirementsFields
                  classData={classData}
                  onFieldChange={handleChange}
                  autoFill={requirementsAutoFill}
                />
              </ExpandableSection>

              {/* Fee Structure Section */}
              <ExpandableSection
                title="Fee Structure"
                icon={<DollarSign className="h-4 w-4" />}
                contentCount={Math.max(feesFieldsCount, 1)}
                storageKey="edit-fees"
                priority="utility"
                forceExpanded={forceExpandAll}
                forceCollapsed={forceCollapseAll}
              >
                <FeeFields classData={classData} onFieldChange={handleChange} />
              </ExpandableSection>
            </div>
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default EditClassDialog;
