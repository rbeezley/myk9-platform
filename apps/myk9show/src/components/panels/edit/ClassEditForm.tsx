import React, { useCallback, useMemo } from 'react';
import { useEditPanel } from './useEditPanel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TimePicker } from '@/components/ui/time-picker';
import { Clock, UserCheck, ClipboardList, Settings } from 'lucide-react';
import { useShowStore } from '@/store/showStore';
import { useUserStore } from '@/store/userStore';
import { useClassRequirements } from '@/hooks/useClassRequirements';
import { cn } from '@/lib/utils';
import { FormField } from '@/components/common/FormField';
import { RuleBadge } from '@/components/classes/OfficialsSection';
import type { ClassEditFormData } from './ClassEditPanel.types';

/** A requirement field with optional auto-fill from rules */
function RequirementField({
  label,
  value,
  onChange,
  autoFillMeta,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoFillMeta?: { ruleValue: string; isJudgeSettable: boolean; placeholder: string } | undefined;
}) {
  const hasRule = autoFillMeta && autoFillMeta.ruleValue !== '';
  const isAutoFilled = hasRule && !autoFillMeta.isJudgeSettable && !value;
  const displayValue = isAutoFilled ? autoFillMeta.ruleValue : value;

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase flex items-center">
        {label}
        {hasRule && !autoFillMeta.isJudgeSettable && <RuleBadge label="From rules" />}
        {autoFillMeta?.isJudgeSettable && <RuleBadge label="Judge sets" />}
      </Label>
      <Input
        value={displayValue}
        onChange={onChange}
        placeholder={autoFillMeta?.placeholder || `Enter ${label.toLowerCase()}`}
        className={isAutoFilled ? 'bg-primary/[0.03] text-muted-foreground border-primary/20' : ''}
        readOnly={hasRule && !autoFillMeta.isJudgeSettable}
      />
    </div>
  );
}

// Full mode form for ClassData
export const ClassEditForm: React.FC<{ showId?: string }> = ({ showId }) => {
  const { data, form } = useEditPanel<ClassEditFormData>();
  const { people } = useUserStore();
  const { shows } = useShowStore();

  const preEntryFeeError = form?.getError('preEntryFee');
  const dayOfShowFeeError = form?.getError('dayOfShowFee');

  const assignedJudges = useMemo(() => {
    if (!showId) return [];
    const currentShow = shows.find((show: { id: string }) => show.id === showId);
    return currentShow?.assignedJudges || [];
  }, [shows, showId]);

  // Fetch class requirements for auto-fill
  const { autoFill } = useClassRequirements({
    element: data.element,
    level: data.level,
    showId,
  });

  const handleInputChange = useCallback(
    (field: keyof ClassEditFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
      form?.setValue(field, value);
    },
    [form]
  );

  const handleBlur = useCallback(
    (field: keyof ClassEditFormData) => () => {
      form?.touchField(field);
    },
    [form]
  );

  const handleSelectChange = useCallback(
    (field: keyof ClassEditFormData) => (value: string) => {
      const finalValue = value === 'none' ? '' : value;
      form?.setValue(field, finalValue);
      form?.touchField(field);
    },
    [form]
  );

  return (
    <div className="space-y-6 p-6">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 transition-all duration-300 ease-out">
          <TabsTrigger
            value="basic"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Settings className="h-4 w-4" />
            Basic
          </TabsTrigger>
          <TabsTrigger
            value="timing"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Clock className="h-4 w-4" />
            Timing
          </TabsTrigger>
          <TabsTrigger
            value="officials"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <UserCheck className="h-4 w-4" />
            Officials
          </TabsTrigger>
          <TabsTrigger
            value="requirements"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <ClipboardList className="h-4 w-4" />
            Requirements
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="basic"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <FormField label="Element" fieldId="element" required>
                  <Input
                    id="element"
                    value={data.element}
                    className="bg-muted text-muted-foreground"
                    readOnly
                  />
                </FormField>
                <FormField label="Level" fieldId="level" required>
                  <Input
                    id="level"
                    value={data.level}
                    className="bg-muted text-muted-foreground"
                    readOnly
                  />
                </FormField>
                <FormField label="Section" fieldId="section">
                  <Input
                    id="section"
                    value={data.section}
                    className="bg-muted text-muted-foreground"
                    readOnly
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Class Order" fieldId="classOrder">
                  <Input
                    id="classOrder"
                    value={data.classOrder}
                    onChange={handleInputChange('classOrder')}
                    onBlur={handleBlur('classOrder')}
                    placeholder="Enter order number"
                  />
                </FormField>
                <FormField label="Status" fieldId="classStatus">
                  <Select value={data.status} onValueChange={handleSelectChange('status')}>
                    <SelectTrigger id="classStatus">
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="timing"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <Card>
            <CardHeader>
              <CardTitle>Timing Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <TimePicker
                  id="estimatedJudgingTime"
                  label="Estimated Judging Time"
                  value={data.estimatedJudgingTime || ''}
                  onChange={value => form?.setValue('estimatedJudgingTime', value)}
                  maxMinutes={data.element === 'Detective' ? 15 : 9}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Time Limits
                  </h4>
                  {autoFill?.timeLimitText.ruleValue && (
                    <RuleBadge
                      label={
                        autoFill.timeLimitText.isJudgeSettable
                          ? `Set by judge (${autoFill.timeLimitText.ruleValue})`
                          : `Rule: ${autoFill.timeLimitText.ruleValue}`
                      }
                    />
                  )}
                </div>

                <TimePicker
                  id="timeLimit1"
                  label="Time Limit 1"
                  value={data.timeLimit1 || ''}
                  onChange={value => form?.setValue('timeLimit1', value)}
                  maxMinutes={data.element === 'Detective' ? 15 : 9}
                />

                {data.element === 'Interior' &&
                  (data.level === 'Excellent' || data.level === 'Master') && (
                    <TimePicker
                      id="timeLimit2"
                      label="Time Limit 2"
                      value={data.timeLimit2 || ''}
                      onChange={value => form?.setValue('timeLimit2', value)}
                      maxMinutes={9}
                    />
                  )}

                {data.element === 'Interior' && data.level === 'Master' && (
                  <TimePicker
                    id="timeLimit3"
                    label="Time Limit 3"
                    value={data.timeLimit3 || ''}
                    onChange={value => form?.setValue('timeLimit3', value)}
                    maxMinutes={9}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="officials"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <Card>
            <CardHeader>
              <CardTitle>Officials</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Judge" fieldId="judgeId">
                  <Select
                    value={data.judgeId || ''}
                    onValueChange={value => {
                      const finalValue = value === 'none' ? '' : value;
                      form?.setValue('judgeId', finalValue);
                      const selectedJudge = assignedJudges.find(j => j.judgeId === finalValue);
                      form?.setValue('judge', selectedJudge?.judgeName || 'TBD');
                      form?.touchField('judgeId');
                    }}
                  >
                    <SelectTrigger id="judgeId">
                      <SelectValue placeholder="Select a judge">
                        {data.judge && data.judge !== 'TBD' ? data.judge : 'Select a judge'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {assignedJudges.length > 0 ? (
                        assignedJudges.map((judge: { judgeId: string; judgeName: string }) => (
                          <SelectItem key={judge.judgeId} value={judge.judgeId}>
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
                </FormField>

                {/* Steward positions */}
                {[
                  { field: 'gateSteward', label: 'Gate Steward' },
                  { field: 'tableSteward', label: 'Table Steward' },
                  { field: 'timerSteward', label: 'Timer Steward' },
                  { field: 'ringSteward1', label: 'Ring Steward 1' },
                  { field: 'ringSteward2', label: 'Ring Steward 2' },
                  { field: 'ringSteward3', label: 'Ring Steward 3' },
                ].map(({ field, label }) => (
                  <FormField key={field} label={label} fieldId={field}>
                    <Select
                      value={((data as Record<string, unknown>)[field] as string) || 'none'}
                      onValueChange={handleSelectChange(field as keyof ClassEditFormData)}
                    >
                      <SelectTrigger id={field}>
                        <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {people.map(person => (
                          <SelectItem
                            key={person.id}
                            value={`${person.firstName} ${person.lastName}`}
                          >
                            {person.firstName} {person.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="requirements"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <Card>
            <CardHeader>
              <CardTitle>Requirements & Fees</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RequirementField
                  label="Hides Used"
                  value={data.hidesUsed || ''}
                  onChange={handleInputChange('hidesUsed')}
                  autoFillMeta={autoFill?.hidesUsed}
                />
                <RequirementField
                  label="Distractions Used"
                  value={data.distractionsUsed || ''}
                  onChange={handleInputChange('distractionsUsed')}
                  autoFillMeta={autoFill?.distractionsUsed}
                />
              </div>

              <RequirementField
                label="Items Used"
                value={data.itemsUsed || ''}
                onChange={handleInputChange('itemsUsed')}
                autoFillMeta={autoFill?.itemsUsed}
              />

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Fee Structure
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    label="Pre Entry Fee ($)"
                    fieldId="preEntryFee"
                    error={preEntryFeeError}
                  >
                    <Input
                      id="preEntryFee"
                      type="number"
                      value={data.preEntryFee || ''}
                      onChange={handleInputChange('preEntryFee')}
                      onBlur={handleBlur('preEntryFee')}
                      placeholder="Enter pre entry fee"
                      min="0"
                      step="0.01"
                      className={cn(preEntryFeeError && 'border-destructive')}
                      aria-invalid={!!preEntryFeeError}
                      aria-describedby={preEntryFeeError ? 'preEntryFee-error' : undefined}
                    />
                  </FormField>

                  <FormField
                    label="Day of Show Fee ($)"
                    fieldId="dayOfShowFee"
                    error={dayOfShowFeeError}
                  >
                    <Input
                      id="dayOfShowFee"
                      type="number"
                      value={data.dayOfShowFee || ''}
                      onChange={handleInputChange('dayOfShowFee')}
                      onBlur={handleBlur('dayOfShowFee')}
                      placeholder="Enter day of show fee"
                      min="0"
                      step="0.01"
                      className={cn(dayOfShowFeeError && 'border-destructive')}
                      aria-invalid={!!dayOfShowFeeError}
                      aria-describedby={dayOfShowFeeError ? 'dayOfShowFee-error' : undefined}
                    />
                  </FormField>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
