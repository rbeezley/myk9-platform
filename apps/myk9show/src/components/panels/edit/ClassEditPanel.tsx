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
import { z } from 'zod';
import { classSchemas } from '@/lib/validation';
import type {
  ClassEditPanelProps,
  ClassEditFormData,
  TrialClassEditFormData,
} from './ClassEditPanel.types';
import {
  classToFormData,
  trialClassToFormData,
  formDataToClass,
  formDataToTrialClass,
} from './ClassEditPanel.helpers';
import { ClassEditForm } from './ClassEditForm';
import { getJudgeNameById } from '@/utils/buildAssignedJudges';

// Cast schemas to match the pre-existing form data interfaces.
// Needed because exactOptionalPropertyTypes causes structural mismatch
// between Zod's optional field output (T | undefined) and the interface's
// optional property syntax (prop?: T).
const classFullSchema = classSchemas.full as unknown as z.ZodSchema<ClassEditFormData>;
const classSimpleSchema = classSchemas.simple as unknown as z.ZodSchema<TrialClassEditFormData>;

// eslint-disable-next-line react-refresh/only-export-components
export function resolveJudgeDisplay(
  judgeId: string | undefined,
  judgeName: string | undefined,
  assignedJudges: ReadonlyArray<{ judgeId: string; judgeName: string }>
): string | undefined {
  if (judgeId === 'TBD') return 'TBD';
  if (!judgeId) return undefined;
  return getJudgeNameById(assignedJudges, judgeId) ?? judgeName;
}

// Simple mode form for TrialClass
const TrialClassEditForm: React.FC<{ showId?: string }> = ({ showId }) => {
  const { data, form } = useEditPanel<TrialClassEditFormData>();
  const { shows } = useShowStore();

  const assignedJudges = useMemo(() => {
    if (!showId) return [];
    const currentShow = shows.find((show: { id: string }) => show.id === showId);
    return currentShow?.assignedJudges || [];
  }, [shows, showId]);

  const handleInputChange = useCallback(
    (field: keyof TrialClassEditFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value;
      form?.setValue(field, value);
    },
    [form]
  );

  const handleBlur = useCallback(
    (field: keyof TrialClassEditFormData) => () => {
      form?.touchField(field);
    },
    [form]
  );

  const handleSelectChange = useCallback(
    (field: keyof TrialClassEditFormData) => (value: string) => {
      form?.setValue(field, value);
      form?.touchField(field);
      if (field === 'judgeId') {
        form?.setValue('judgeName', getJudgeNameById(assignedJudges, value) ?? 'TBD');
      }
    },
    [form, assignedJudges]
  );

  const judgeError = form?.getError('judgeId');
  const startTimeError = form?.getError('startTime');
  const statusError = form?.getError('status');

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
                  <SelectValue placeholder="Select a judge">
                    {/* Resolve UUID → name explicitly: Radix doesn't re-resolve
                        the SelectItem display when assignedJudges loads after
                        the form mounts, so the trigger would otherwise show the
                        raw judgeId. */}
                    {resolveJudgeDisplay(data.judgeId, data.judgeName, assignedJudges)}
                  </SelectValue>
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
                onBlur={handleBlur('startTime')}
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

  const commonProps = {
    open,
    onClose,
    title: 'Edit Class',
    subtitle: `Editing details for ${className}`,
    size: 'xl' as const,
    enableAutoSave,
    saveLabel: 'Save Changes',
    cancelLabel: 'Cancel',
  };

  if (isSimpleMode) {
    const initialFormData = trialClassToFormData(initialClassData as Partial<TrialClass>);

    const handleSave = async (formData: TrialClassEditFormData) => {
      const classData = formDataToTrialClass(formData);
      if (onSave) await onSave(classData);
    };

    return (
      <EditPanelWrapper<TrialClassEditFormData>
        {...commonProps}
        initialData={initialFormData}
        onSave={handleSave}
        schema={classSimpleSchema}
      >
        <TrialClassEditForm {...(showId !== undefined && { showId })} />
      </EditPanelWrapper>
    );
  }

  const initialFormData = classToFormData(initialClassData as Partial<ClassData>);

  const handleSave = async (formData: ClassEditFormData) => {
    const classData = formDataToClass(formData);
    if (onSave) await onSave(classData);
  };

  return (
    <EditPanelWrapper<ClassEditFormData>
      {...commonProps}
      initialData={initialFormData}
      onSave={handleSave}
      schema={classFullSchema}
    >
      <ClassEditForm {...(showId !== undefined && { showId })} />
    </EditPanelWrapper>
  );
};

export default ClassEditPanel;
