import React, { useCallback, useMemo } from 'react';
import { EditPanelWrapper } from './EditPanelWrapper';
import { savedMessage } from './panelSaveErrors';
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
  isScentWorkNovice,
  hasLoadedCapacity,
  withoutLiveSettings,
} from './ClassEditPanel.helpers';
import { ClassEditForm } from './ClassEditForm';
import { ClassLiveSettingsCard } from './ClassLiveSettingsCard';
import { useLiveJudgeSync } from './useLiveJudgeSync';
import { ClassWaitlistFields } from './ClassWaitlistFields';
import { ClassEntryFeeField } from './ClassEntryFeeField';
import { usePanelValidationNavigation } from './usePanelValidationNavigation';
import { locateClassField, type ClassTabValue } from './ClassEditPanel.validationTab';
import { NoJudgesNotice } from '@/components/shows/NoJudgesNotice';
import { getJudgeNameById } from '@/utils/buildAssignedJudges';
import { formatJudgeAvailabilityWindow } from '@/utils/classJudgeDisplay';
import { JudgeChangeWarning } from '@/components/classes/JudgeChangeWarning';
import type { CurrentClassJudge, OutgoingJudge } from './ClassEditPanel.types';

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
  // A legacy 'TBD' id is unset like an empty one (MYK9-1850): show the placeholder.
  if (!judgeId || judgeId === 'TBD') return undefined;
  return getJudgeNameById(assignedJudges, judgeId) ?? judgeName;
}

type CapacitySourceLike = Parameters<typeof hasLoadedCapacity>[0];

// Simple mode form for TrialClass
const TrialClassEditForm: React.FC<{
  showId?: string;
  classId?: string;
  capacityLoaded: boolean;
  outgoingJudge: OutgoingJudge;
  liveSettings?: React.ReactNode;
  liveJudge: boolean;
  currentJudge: CurrentClassJudge | undefined;
}> = ({
  showId,
  classId,
  capacityLoaded,
  outgoingJudge,
  liveSettings,
  liveJudge,
  currentJudge,
}) => {
  const { data, form } = useEditPanel<TrialClassEditFormData>();
  const { shows } = useShowStore();

  const assignedJudges = useMemo(() => {
    if (!showId) return [];
    const currentShow = shows.find((show: { id: string }) => show.id === showId);
    return currentShow?.assignedJudges || [];
  }, [shows, showId]);

  const handleSelectChange = useCallback(
    (field: keyof TrialClassEditFormData) => (value: string) => {
      form?.setValue(field, value);
      form?.touchField(field);
      if (field === 'judgeId') {
        form?.setValue('judgeName', getJudgeNameById(assignedJudges, value) ?? '');
      }
    },
    [form, assignedJudges]
  );

  useLiveJudgeSync(currentJudge, data.judgeId, (id, name) => {
    form?.setValue('judgeId', id);
    form?.setValue('judgeName', name);
  });

  const judgeError = form?.getError('judgeId');
  const statusError = form?.getError('status');

  return (
    <div className="space-y-6 p-6">
      {liveSettings && <ClassLiveSettingsCard>{liveSettings}</ClassLiveSettingsCard>}
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
            {/* Section (A/B) only applies to AKC Scent Work Novice — Advanced and Excellent do not have sections */}
            {isScentWorkNovice(data.level, data.element) ? (
              <FormField label="Section" fieldId="trialSection">
                <Input
                  id="trialSection"
                  value={data.section}
                  className="bg-muted text-muted-foreground"
                  disabled
                  readOnly
                />
              </FormField>
            ) : (
              <div /> /* grid spacer — keeps Element in column 1 of the 3-col grid */
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {!liveJudge && (
              <FormField label="Judge" fieldId="judgeId" error={judgeError}>
                {/*
                F12: the same dead end as the full form -- a DISABLED
                "No judges assigned to this show" option, naming the problem inside the
                control that cannot solve it. Which of the two forms renders is decided
                by the shape of `initialClassData`, so both need the way out.
              */}
                {showId && assignedJudges.length === 0 && (
                  <NoJudgesNotice
                    showId={showId}
                    message="No judges on this show yet, so there is nobody to assign to this class."
                    className="mb-2"
                  />
                )}
                {/* See the note in ClassEditForm: a stale assignment still needs TBD. */}
                {(assignedJudges.length > 0 || !!data.judgeId) && (
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
                      {assignedJudges.map(judge => (
                        <SelectItem key={judge.judgeId} value={judge.judgeId}>
                          {judge.judgeName}
                          {formatJudgeAvailabilityWindow(judge) && (
                            <span className="text-xs text-muted-foreground ml-2">
                              {formatJudgeAvailabilityWindow(judge)}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                      <SelectItem value="TBD">TBD</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <JudgeChangeWarning {...outgoingJudge} selectedJudgeId={data.judgeId} />
              </FormField>
            )}
            {!liveSettings && (
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
            )}
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

      {capacityLoaded && <ClassWaitlistFields showId={showId} />}
      {data.entryFeeLoaded && <ClassEntryFeeField showId={showId} classId={classId} />}
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
  classId,
  showId,
  mode = 'full',
  onDelete,
  liveSettings,
  liveJudge = false,
  currentJudge,
}) => {
  // A failed Save moves to the tab holding the first invalid field (MYK9-931).
  const { activeTab, setActiveTab, handleValidationFail } =
    usePanelValidationNavigation<ClassTabValue>('basic', locateClassField, open);

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
    onDelete,
    successMessage: savedMessage(className, 'Class'),
  };

  const capacityLoaded = hasLoadedCapacity(initialClassData as CapacitySourceLike);
  // The class as it is now: the judge and status may have moved since the panel opened.
  const initialRecord = {
    ...(initialClassData ?? {}),
    ...(currentJudge && {
      judgeId: currentJudge.id ?? '',
      judge: currentJudge.name ?? '',
      judgeName: currentJudge.name ?? '',
    }),
  } as Partial<ClassData> & Partial<TrialClass>;
  // The judge this panel opened with: the one a change replaces (MYK9-2015).
  const outgoingJudge: OutgoingJudge = {
    classId,
    classStatus: currentJudge?.status ?? initialRecord.status,
    outgoingJudgeId: initialRecord.judgeId,
    outgoingJudgeName: initialRecord.judgeName || initialRecord.judge,
  };

  if (isSimpleMode) {
    const initialFormData = trialClassToFormData(initialRecord);

    const handleSave = async (formData: TrialClassEditFormData) => {
      const classData = formDataToTrialClass(formData);
      // The live settings saved themselves: only a judge picked in this form is still unsaved.
      const judgeEdited = formData.judgeId !== initialFormData.judgeId;
      if (onSave) {
        await onSave(
          liveSettings ? withoutLiveSettings(classData, { keepJudge: judgeEdited }) : classData
        );
      }
    };

    return (
      <EditPanelWrapper<TrialClassEditFormData>
        {...commonProps}
        initialData={initialFormData}
        onSave={handleSave}
        schema={classSimpleSchema}
      >
        <TrialClassEditForm
          classId={classId}
          capacityLoaded={capacityLoaded}
          outgoingJudge={outgoingJudge}
          liveSettings={liveSettings}
          liveJudge={liveJudge}
          currentJudge={currentJudge}
          {...(showId !== undefined && { showId })}
        />
      </EditPanelWrapper>
    );
  }

  const initialFormData = classToFormData(initialRecord);

  const handleSave = async (formData: ClassEditFormData) => {
    const classData = formDataToClass(formData);
    // The live settings saved themselves: only a judge picked in this form is still unsaved.
    const judgeEdited = formData.judgeId !== initialFormData.judgeId;
    if (onSave) {
      await onSave(
        liveSettings ? withoutLiveSettings(classData, { keepJudge: judgeEdited }) : classData
      );
    }
  };

  return (
    <EditPanelWrapper<ClassEditFormData>
      {...commonProps}
      initialData={initialFormData}
      onSave={handleSave}
      schema={classFullSchema}
      onValidationFail={handleValidationFail}
    >
      <ClassEditForm
        classId={classId}
        activeTab={activeTab}
        outgoingJudge={outgoingJudge}
        onTabChange={setActiveTab}
        capacityLoaded={capacityLoaded}
        liveSettings={liveSettings}
        liveJudge={liveJudge}
        currentJudge={currentJudge}
        {...(showId !== undefined && { showId })}
      />
    </EditPanelWrapper>
  );
};

export default ClassEditPanel;
