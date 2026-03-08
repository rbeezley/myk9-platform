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
import { Clock, UserCheck, ClipboardList, Settings, BookOpen } from 'lucide-react';
import { useShowStore } from '@/store/showStore';
import { useUserStore } from '@/store/userStore';
import { useClassRequirements } from '@/hooks/useClassRequirements';
import { cn } from '@/lib/utils';
import type { ClassEditFormData } from './ClassEditPanel.types';

/** Badge shown next to rule-sourced fields */
function RuleBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary/70 bg-primary/5 border border-primary/10 rounded px-1.5 py-0.5 ml-2">
      <BookOpen className="h-3 w-3" />
      {label}
    </span>
  );
}

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
  const { data, updateData, errors } = useEditPanel<ClassEditFormData>();
  const { people } = useUserStore();
  const { shows } = useShowStore();

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
      updateData({ [field]: value });
    },
    [updateData]
  );

  const handleSelectChange = useCallback(
    (field: keyof ClassEditFormData) => (value: string) => {
      const finalValue = value === 'none' ? '' : value;
      updateData({ [field]: finalValue });
    },
    [updateData]
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
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                    Element *
                  </Label>
                  <Input value={data.element} className="bg-muted text-muted-foreground" readOnly />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                    Level *
                  </Label>
                  <Input value={data.level} className="bg-muted text-muted-foreground" readOnly />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                    Section
                  </Label>
                  <Input value={data.section} className="bg-muted text-muted-foreground" readOnly />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                    Class Order
                  </Label>
                  <Input
                    value={data.classOrder}
                    onChange={handleInputChange('classOrder')}
                    placeholder="Enter order number"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                    Status
                  </Label>
                  <Select value={data.status} onValueChange={handleSelectChange('status')}>
                    <SelectTrigger>
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
                  onChange={value => updateData({ estimatedJudgingTime: value })}
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
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary/70 bg-primary/5 border border-primary/10 rounded px-1.5 py-0.5">
                      <BookOpen className="h-3 w-3" />
                      {autoFill.timeLimitText.isJudgeSettable
                        ? `Set by judge (${autoFill.timeLimitText.ruleValue})`
                        : `Rule: ${autoFill.timeLimitText.ruleValue}`}
                    </span>
                  )}
                </div>

                <TimePicker
                  id="timeLimit1"
                  label="Time Limit 1"
                  value={data.timeLimit1 || ''}
                  onChange={value => updateData({ timeLimit1: value })}
                  maxMinutes={data.element === 'Detective' ? 15 : 9}
                />

                {data.element === 'Interior' &&
                  (data.level === 'Excellent' || data.level === 'Master') && (
                    <TimePicker
                      id="timeLimit2"
                      label="Time Limit 2"
                      value={data.timeLimit2 || ''}
                      onChange={value => updateData({ timeLimit2: value })}
                      maxMinutes={9}
                    />
                  )}

                {data.element === 'Interior' && data.level === 'Master' && (
                  <TimePicker
                    id="timeLimit3"
                    label="Time Limit 3"
                    value={data.timeLimit3 || ''}
                    onChange={value => updateData({ timeLimit3: value })}
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
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                    Judge
                  </Label>
                  <Select value={data.judge || ''} onValueChange={handleSelectChange('judge')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a judge" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignedJudges.length > 0 ? (
                        assignedJudges.map((judge: { judgeId: string; judgeName: string }) => (
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

                {/* Steward positions */}
                {[
                  { field: 'gateSteward', label: 'Gate Steward' },
                  { field: 'tableSteward', label: 'Table Steward' },
                  { field: 'timerSteward', label: 'Timer Steward' },
                  { field: 'ringSteward1', label: 'Ring Steward 1' },
                  { field: 'ringSteward2', label: 'Ring Steward 2' },
                  { field: 'ringSteward3', label: 'Ring Steward 3' },
                ].map(({ field, label }) => (
                  <div key={field} className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                      {label}
                    </Label>
                    <Select
                      value={((data as Record<string, unknown>)[field] as string) || 'none'}
                      onValueChange={handleSelectChange(field as keyof ClassEditFormData)}
                    >
                      <SelectTrigger>
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
                  </div>
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
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                      Pre Entry Fee ($)
                    </Label>
                    <Input
                      type="number"
                      value={data.preEntryFee || ''}
                      onChange={handleInputChange('preEntryFee')}
                      placeholder="Enter pre entry fee"
                      min="0"
                      step="0.01"
                      className={cn(
                        errors.some(e => e.includes('Pre-entry fee')) && 'border-destructive'
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                      Day of Show Fee ($)
                    </Label>
                    <Input
                      type="number"
                      value={data.dayOfShowFee || ''}
                      onChange={handleInputChange('dayOfShowFee')}
                      placeholder="Enter day of show fee"
                      min="0"
                      step="0.01"
                      className={cn(
                        errors.some(e => e.includes('Day of show fee')) && 'border-destructive'
                      )}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
