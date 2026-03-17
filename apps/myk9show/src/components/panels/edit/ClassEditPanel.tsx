import React, { useCallback, useMemo } from 'react';
import { EditPanelWrapper } from './EditPanelWrapper';
import { useEditPanel } from './useEditPanel';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ClassData } from '@/components/classes/types/classTypes';
import { TrialClass } from '@/components/trials/types/trial.types';
import { useShowStore } from '@/store/showStore';
import { cn } from '@/lib/utils';
import { FormField } from '@/components/common/FormField';
import { findFieldError } from '@/lib/validation';
import type {
  ClassEditPanelProps,
  ClassEditFormData,
  TrialClassEditFormData,
} from './ClassEditPanel.types';
import {
  validateClassData,
  validateTrialClassData,
  classToFormData,
  trialClassToFormData,
  formDataToClass,
  formDataToTrialClass,
} from './ClassEditPanel.helpers';
import { ClassEditForm } from './ClassEditForm';

// Simple mode form for TrialClass
const TrialClassEditForm: React.FC<{ showId?: string }> = ({ showId }) => {
  const { data, updateData, errors } = useEditPanel<TrialClassEditFormData>();
  const { shows } = useShowStore();

  const assignedJudges = useMemo(() => {
    if (!showId) return [];
    const currentShow = shows.find((show: { id: string }) => show.id === showId);
    return currentShow?.assignedJudges || [];
  }, [shows, showId]);

  const handleInputChange = useCallback(
    (field: keyof TrialClassEditFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value;
      updateData({ [field]: value });
    },
    [updateData]
  );

  const handleSelectChange = useCallback(
    (field: keyof TrialClassEditFormData) => (value: string) => {
      updateData({ [field]: value });
      if (field === 'judgeId') {
        const selectedJudge = assignedJudges.find(judge => judge.judgeId === value);
        updateData({ judgeName: selectedJudge?.judgeName || 'TBD' });
      }
    },
    [updateData, assignedJudges]
  );

  const judgeError = findFieldError(errors, 'judge');
  const startTimeError = findFieldError(errors, 'start time');
  const statusError = findFieldError(errors, 'status');

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Class Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Element" fieldId="trialElement">
              <Input
                id="trialElement"
                value={data.element}
                className="bg-muted text-muted-foreground"
                disabled
                readOnly
              />
            </FormField>
            <FormField label="Level" fieldId="trialLevel">
              <Input
                id="trialLevel"
                value={data.level}
                className="bg-muted text-muted-foreground"
                disabled
                readOnly
              />
            </FormField>
            <FormField label="Section" fieldId="trialSection">
              <Input
                id="trialSection"
                value={data.section}
                className="bg-muted text-muted-foreground"
                disabled
                readOnly
              />
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Judge" fieldId="judgeId" required error={judgeError}>
              <Select value={data.judgeId} onValueChange={handleSelectChange('judgeId')}>
                <SelectTrigger
                  id="judgeId"
                  className={cn(judgeError && 'border-destructive')}
                  aria-invalid={!!judgeError}
                  aria-describedby={judgeError ? 'judgeId-error' : undefined}
                >
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
            </FormField>
            <FormField label="Start Time" fieldId="startTime" required error={startTimeError}>
              <Input
                id="startTime"
                type="datetime-local"
                value={data.startTime}
                onChange={handleInputChange('startTime')}
                className={cn(startTimeError && 'border-destructive')}
                aria-invalid={!!startTimeError}
                aria-describedby={startTimeError ? 'startTime-error' : undefined}
              />
            </FormField>
            <FormField label="Status" fieldId="trialStatus" required error={statusError}>
              <Select value={data.status} onValueChange={handleSelectChange('status')}>
                <SelectTrigger
                  id="trialStatus"
                  className={cn(statusError && 'border-destructive')}
                  aria-invalid={!!statusError}
                  aria-describedby={statusError ? 'trialStatus-error' : undefined}
                >
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Upcoming">Upcoming</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Number of Entries" fieldId="trialEntries">
              <Input
                id="trialEntries"
                type="number"
                value={data.entries}
                className="bg-muted text-muted-foreground"
                disabled
                readOnly
              />
            </FormField>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Main component
export const ClassEditPanel: React.FC<ClassEditPanelProps> = ({
  open,
  onClose,
  className,
  initialClassData,
  onSave,
  enableAutoSave = false,
  showId,
  mode = 'full',
}) => {
  const isSimpleMode =
    mode === 'simple' ||
    ('judgeId' in (initialClassData || {}) &&
      !('estimatedJudgingTime' in (initialClassData || {})));

  const initialFormData = useMemo(() => {
    if (isSimpleMode) {
      return trialClassToFormData(initialClassData as Partial<TrialClass>);
    } else {
      return classToFormData(initialClassData as Partial<ClassData>);
    }
  }, [initialClassData, isSimpleMode]);

  const handleSave = useCallback(
    async (formData: ClassEditFormData | TrialClassEditFormData) => {
      const classData = isSimpleMode
        ? formDataToTrialClass(formData as TrialClassEditFormData)
        : formDataToClass(formData as ClassEditFormData);
      if (onSave) await onSave(classData);
    },
    [onSave, isSimpleMode]
  );

  const validateData = useCallback(
    (data: ClassEditFormData | TrialClassEditFormData) => {
      return isSimpleMode
        ? validateTrialClassData(data as TrialClassEditFormData)
        : validateClassData(data as ClassEditFormData);
    },
    [isSimpleMode]
  );

  return (
    <EditPanelWrapper<ClassEditFormData | TrialClassEditFormData>
      open={open}
      onClose={onClose}
      title="Edit Class"
      subtitle={`Editing details for ${className}`}
      size="xl"
      initialData={initialFormData}
      onSave={handleSave}
      validateData={validateData}
      enableAutoSave={enableAutoSave}
      saveLabel="Save Changes"
      cancelLabel="Cancel"
    >
      {isSimpleMode ? (
        <TrialClassEditForm {...(showId !== undefined && { showId })} />
      ) : (
        <ClassEditForm {...(showId !== undefined && { showId })} />
      )}
    </EditPanelWrapper>
  );
};

export default ClassEditPanel;
