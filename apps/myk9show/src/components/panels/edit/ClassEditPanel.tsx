import React, { useCallback, useMemo } from 'react';
import { EditPanelWrapper } from './EditPanelWrapper';
import { useEditPanel } from './useEditPanel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TimePicker } from '@/components/ui/time-picker';
import { Clock, UserCheck, ClipboardList, Settings } from 'lucide-react';
import { ClassData } from '@/components/classes/types/classTypes';
import { TrialClass } from '@/components/trials/types/trial.types';
import { useShowStore } from '@/store/showStore';
import { useUserStore } from '@/store/userStore';
import { cn } from '@/lib/utils';

interface ClassEditPanelProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  initialClassData: Partial<ClassData | TrialClass>;
  onSave?: (classData: Partial<ClassData | TrialClass>) => Promise<void>;
  enableAutoSave?: boolean;
  showId?: string;
  mode?: 'full' | 'simple'; // 'full' for ClassData with tabs, 'simple' for TrialClass
}

// Form data interface for full ClassData
interface ClassEditFormData extends Record<string, unknown> {
  // Basic info
  element: string;
  level: string;
  section: string;
  classOrder: string;
  status: 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled' | 'Scheduled';
  
  // Timing details
  estimatedJudgingTime?: string;
  timeLimit1?: string;
  timeLimit2?: string;
  timeLimit3?: string;
  
  // Officials
  judge?: string;
  gateSteward?: string;
  tableSteward?: string;
  timerSteward?: string;
  ringSteward1?: string;
  ringSteward2?: string;
  ringSteward3?: string;
  
  // Requirements
  hidesUsed?: string;
  distractionsUsed?: string;
  itemsUsed?: string;
  
  // Fee structure
  preEntryFee?: number;
  dayOfShowFee?: number;
}

// Form data interface for simple TrialClass
interface TrialClassEditFormData extends Record<string, unknown> {
  element: string;
  level: string;
  section: string;
  judgeId: string;
  judgeName?: string;
  startTime: string;
  status: 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled';
  entries: number;
}

// Form validation for ClassData
const validateClassData = (data: ClassEditFormData): string[] | null => {
  const errors: string[] = [];

  if (!data.element?.trim()) {
    errors.push('Element is required');
  }

  if (!data.level?.trim()) {
    errors.push('Level is required');
  }

  // Validate time limits if provided
  if (data.timeLimit1 && isNaN(parseInt(data.timeLimit1))) {
    errors.push('Time Limit 1 must be a valid number');
  }

  if (data.timeLimit2 && isNaN(parseInt(data.timeLimit2))) {
    errors.push('Time Limit 2 must be a valid number');
  }

  if (data.timeLimit3 && isNaN(parseInt(data.timeLimit3))) {
    errors.push('Time Limit 3 must be a valid number');
  }

  // Validate fees if provided
  if (data.preEntryFee && (isNaN(data.preEntryFee) || data.preEntryFee < 0)) {
    errors.push('Pre-entry fee must be a valid positive number');
  }

  if (data.dayOfShowFee && (isNaN(data.dayOfShowFee) || data.dayOfShowFee < 0)) {
    errors.push('Day of show fee must be a valid positive number');
  }

  return errors.length > 0 ? errors : null;
};

// Form validation for TrialClass
const validateTrialClassData = (data: TrialClassEditFormData): string[] | null => {
  const errors: string[] = [];

  if (!data.judgeId?.trim()) {
    errors.push('Judge is required');
  }

  if (!data.startTime?.trim()) {
    errors.push('Start time is required');
  }

  if (!data.status?.trim()) {
    errors.push('Status is required');
  }

  return errors.length > 0 ? errors : null;
};

// Convert ClassData to form data
const classToFormData = (classItem: Partial<ClassData>): ClassEditFormData => {
  return {
    element: classItem.element || '',
    level: classItem.level || '',
    section: classItem.section || '',
    classOrder: classItem.classOrder || '',
    status: (classItem.status as 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled' | 'Scheduled') || 'Scheduled',
    estimatedJudgingTime: classItem.estimatedJudgingTime || '',
    timeLimit1: classItem.timeLimit1 || '',
    timeLimit2: classItem.timeLimit2 || '',
    timeLimit3: classItem.timeLimit3 || '',
    judge: classItem.judge || '',
    gateSteward: classItem.gateSteward || '',
    tableSteward: classItem.tableSteward || '',
    timerSteward: classItem.timerSteward || '',
    ringSteward1: classItem.ringSteward1 || '',
    ringSteward2: classItem.ringSteward2 || '',
    ringSteward3: classItem.ringSteward3 || '',
    hidesUsed: classItem.hidesUsed || '',
    distractionsUsed: classItem.distractionsUsed || '',
    itemsUsed: classItem.itemsUsed || '',
    preEntryFee: classItem.preEntryFee || 0,
    dayOfShowFee: classItem.dayOfShowFee || 0,
  };
};

// Convert TrialClass to form data
const trialClassToFormData = (trialClass: Partial<TrialClass>): TrialClassEditFormData => {
  return {
    element: trialClass.element || '',
    level: trialClass.level || '',
    section: trialClass.section || '',
    judgeId: trialClass.judgeId || '',
    judgeName: trialClass.judgeName || '',
    startTime: trialClass.startTime || '',
    status: trialClass.status || 'Upcoming',
    entries: trialClass.entries || 0,
  };
};

// Convert form data back to ClassData
const formDataToClass = (formData: ClassEditFormData): Partial<ClassData> => ({
  element: formData.element,
  level: formData.level,
  section: formData.section,
  classOrder: formData.classOrder,
  status: formData.status,
  estimatedJudgingTime: formData.estimatedJudgingTime,
  timeLimit1: formData.timeLimit1,
  timeLimit2: formData.timeLimit2,
  timeLimit3: formData.timeLimit3,
  judge: formData.judge,
  gateSteward: formData.gateSteward,
  tableSteward: formData.tableSteward,
  timerSteward: formData.timerSteward,
  ringSteward1: formData.ringSteward1,
  ringSteward2: formData.ringSteward2,
  ringSteward3: formData.ringSteward3,
  hidesUsed: formData.hidesUsed,
  distractionsUsed: formData.distractionsUsed,
  itemsUsed: formData.itemsUsed,
  preEntryFee: formData.preEntryFee,
  dayOfShowFee: formData.dayOfShowFee,
});

// Convert form data back to TrialClass
const formDataToTrialClass = (formData: TrialClassEditFormData): Partial<TrialClass> => ({
  element: formData.element,
  level: formData.level,
  section: formData.section,
  judgeId: formData.judgeId,
  judgeName: formData.judgeName,
  startTime: formData.startTime,
  status: formData.status,
  entries: formData.entries,
});

// Simple mode form for TrialClass
const TrialClassEditForm: React.FC<{ showId?: string }> = ({ showId }) => {
  const { data, updateData, errors } = useEditPanel<TrialClassEditFormData>();
  const { shows } = useShowStore();

  // Get assigned judges
  const assignedJudges = useMemo(() => {
    if (!showId) return [];
    const currentShow = shows.find((show: { id: string }) => show.id === showId);
    return currentShow?.assignedJudges || [];
  }, [shows, showId]);

  const handleInputChange = useCallback((field: keyof TrialClassEditFormData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value;
    updateData({ [field]: value });
  }, [updateData]);

  const handleSelectChange = useCallback((field: keyof TrialClassEditFormData) => (value: string) => {
    updateData({ [field]: value });
    if (field === 'judgeId') {
      const selectedJudge = assignedJudges.find(judge => judge.judgeId === value);
      updateData({ judgeName: selectedJudge?.judgeName || 'TBD' });
    }
  }, [updateData, assignedJudges]);

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Class Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Row 1: Element, Level, Section - Read Only */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Element</Label>
              <Input
                value={data.element}
                className="bg-muted text-muted-foreground"
                disabled
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Level</Label>
              <Input
                value={data.level}
                className="bg-muted text-muted-foreground"
                disabled
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Section</Label>
              <Input
                value={data.section}
                className="bg-muted text-muted-foreground"
                disabled
                readOnly
              />
            </div>
          </div>

          {/* Row 2: Judge, Start Time, Status */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Judge *</Label>
              <Select
                value={data.judgeId}
                onValueChange={handleSelectChange('judgeId')}
              >
                <SelectTrigger className={cn(
                  errors.some(e => e.includes('Judge')) && 'border-destructive'
                )}>
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
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Start Time *</Label>
              <Input
                type="datetime-local"
                value={data.startTime}
                onChange={handleInputChange('startTime')}
                className={cn(
                  errors.some(e => e.includes('Start time')) && 'border-destructive'
                )}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Status *</Label>
              <Select
                value={data.status}
                onValueChange={handleSelectChange('status')}
              >
                <SelectTrigger className={cn(
                  errors.some(e => e.includes('Status')) && 'border-destructive'
                )}>
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

          {/* Row 3: Number of Entries */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Number of Entries</Label>
              <Input
                type="number"
                value={data.entries}
                className="bg-muted text-muted-foreground"
                disabled
                readOnly
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Full mode form for ClassData
const ClassEditForm: React.FC<{ showId?: string }> = ({ showId }) => {
  const { data, updateData, errors } = useEditPanel<ClassEditFormData>();
  const { people } = useUserStore();
  const { shows } = useShowStore();

  // Get assigned judges
  const assignedJudges = useMemo(() => {
    if (!showId) return [];
    const currentShow = shows.find((show: { id: string }) => show.id === showId);
    return currentShow?.assignedJudges || [];
  }, [shows, showId]);

  const handleInputChange = useCallback((field: keyof ClassEditFormData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
    updateData({ [field]: value });
  }, [updateData]);

  const handleSelectChange = useCallback((field: keyof ClassEditFormData) => (value: string) => {
    const finalValue = value === 'none' ? '' : value;
    updateData({ [field]: finalValue });
  }, [updateData]);

  return (
    <div className="space-y-6 p-6">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 transition-all duration-300 ease-out">
          <TabsTrigger value="basic" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300">
            <Settings className="h-4 w-4" />
            Basic
          </TabsTrigger>
          <TabsTrigger value="timing" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300">
            <Clock className="h-4 w-4" />
            Timing
          </TabsTrigger>
          <TabsTrigger value="officials" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300">
            <UserCheck className="h-4 w-4" />
            Officials
          </TabsTrigger>
          <TabsTrigger value="requirements" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300">
            <ClipboardList className="h-4 w-4" />
            Requirements
          </TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Element *</Label>
                  <Input
                    value={data.element}
                    className="bg-muted text-muted-foreground"
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Level *</Label>
                  <Input
                    value={data.level}
                    className="bg-muted text-muted-foreground"
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Section</Label>
                  <Input
                    value={data.section}
                    className="bg-muted text-muted-foreground"
                    readOnly
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Class Order</Label>
                  <Input
                    value={data.classOrder}
                    onChange={handleInputChange('classOrder')}
                    placeholder="Enter order number"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Status</Label>
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

        <TabsContent value="timing" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out">
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
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Time Limits</h4>
                
                <TimePicker
                  id="timeLimit1"
                  label="Time Limit 1"
                  value={data.timeLimit1 || ''}
                  onChange={value => updateData({ timeLimit1: value })}
                  maxMinutes={data.element === 'Detective' ? 15 : 9}
                />

                {data.element === 'Interior' && (data.level === 'Excellent' || data.level === 'Master') && (
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

        <TabsContent value="officials" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out">
          <Card>
            <CardHeader>
              <CardTitle>Officials</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Judge</Label>
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
                  { field: 'ringSteward3', label: 'Ring Steward 3' }
                ].map(({ field, label }) => (
                  <div key={field} className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">{label}</Label>
                    <Select 
                      value={(data as Record<string, unknown>)[field] as string || 'none'} 
                      onValueChange={handleSelectChange(field as keyof ClassEditFormData)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
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
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requirements" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out">
          <Card>
            <CardHeader>
              <CardTitle>Requirements & Fees</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Hides Used</Label>
                  <Input
                    value={data.hidesUsed || ''}
                    onChange={handleInputChange('hidesUsed')}
                    placeholder="Enter number of hides"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Distractions Used</Label>
                  <Input
                    value={data.distractionsUsed || ''}
                    onChange={handleInputChange('distractionsUsed')}
                    placeholder="Enter distractions"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Items Used</Label>
                <Input
                  value={data.itemsUsed || ''}
                  onChange={handleInputChange('itemsUsed')}
                  placeholder="Enter items used"
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Fee Structure</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Pre Entry Fee ($)</Label>
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
                    <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Day of Show Fee ($)</Label>
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

// Main component
export const ClassEditPanel: React.FC<ClassEditPanelProps> = ({
  open,
  onClose,
  className,
  initialClassData,
  onSave,
  enableAutoSave = false,
  showId,
  mode = 'full'
}) => {
  // Determine if this is a simple TrialClass or full ClassData
  const isSimpleMode = mode === 'simple' || ('judgeId' in (initialClassData || {}) && !('estimatedJudgingTime' in (initialClassData || {})));
  
  // Convert class data to appropriate form data
  const initialFormData = useMemo(() => {
    if (isSimpleMode) {
      return trialClassToFormData(initialClassData as Partial<TrialClass>);
    } else {
      return classToFormData(initialClassData as Partial<ClassData>);
    }
  }, [initialClassData, isSimpleMode]);
  
  // Handle save
  const handleSave = useCallback(async (formData: ClassEditFormData | TrialClassEditFormData) => {
    let classData;
    if (isSimpleMode) {
      classData = formDataToTrialClass(formData as TrialClassEditFormData);
    } else {
      classData = formDataToClass(formData as ClassEditFormData);
    }
    
    if (onSave) {
      await onSave(classData);
    }
  }, [onSave, isSimpleMode]);

  // Choose appropriate validation function
  const validateData = useCallback((data: ClassEditFormData | TrialClassEditFormData) => {
    if (isSimpleMode) {
      return validateTrialClassData(data as TrialClassEditFormData);
    } else {
      return validateClassData(data as ClassEditFormData);
    }
  }, [isSimpleMode]);

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
        <TrialClassEditForm showId={showId} />
      ) : (
        <ClassEditForm showId={showId} />
      )}
    </EditPanelWrapper>
  );
};

export default ClassEditPanel;