import React, { useCallback, useMemo } from 'react';
import { EditPanelWrapper } from './EditPanelWrapper';
import { useEditPanel } from './useEditPanel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar, Users, UserCheck, DollarSign } from 'lucide-react';
import { useTemplateStore } from '@/store/templateStore';
import { useClubStore } from '@/store/clubStore';
import { useUserStore } from '@/store/userStore';
import type { Show } from '@/types/show-types';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import { cn } from '@/lib/utils';

interface ShowEditPanelProps {
  open: boolean;
  onClose: () => void;
  showId: string;
  showName: string;
  initialShowData: Partial<Show>;
  onSave?: (showData: Partial<Show>) => Promise<void>;
  enableAutoSave?: boolean;
  showAdvancedFields?: boolean;
}

// Form data interface extending ShowInput for edit panel needs
interface ShowEditFormData extends Record<string, unknown> {
  name: string;
  status: string;
  type: string;
  clubId: string;
  startDate: string;
  endDate: string;
  location: string;
  chairman: string;
  secretary: string;
  chiefSteward: string;
  entryOpenDate: string;
  entryCloseDate: string;
  preEntryFee: string;
  dayOfShowFee: string;
  assignedJudges: ShowJudgeAssignment[];
  // Additional optional fields
  maxEntriesPerDog?: number;
  maxTotalEntries?: number;
  allowNonOwnerHandlers?: boolean;
}

// Form validation
const validateShowData = (data: ShowEditFormData): string[] | null => {
  const errors: string[] = [];

  if (!data.name?.trim()) {
    errors.push('Show name is required');
  }

  if (!data.clubId?.trim()) {
    errors.push('Hosting club is required');
  }

  if (!data.startDate?.trim()) {
    errors.push('Start date is required');
  }

  if (!data.endDate?.trim()) {
    errors.push('End date is required');
  }

  // Validate date logic
  if (data.startDate && data.endDate) {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    if (endDate < startDate) {
      errors.push('End date must be after start date');
    }
  }

  if (data.entryOpenDate && data.entryCloseDate) {
    const openDate = new Date(data.entryOpenDate);
    const closeDate = new Date(data.entryCloseDate);
    if (closeDate < openDate) {
      errors.push('Entry close date must be after entry open date');
    }
  }

  if (data.entryCloseDate && data.startDate) {
    const closeDate = new Date(data.entryCloseDate);
    const showDate = new Date(data.startDate);
    if (closeDate > showDate) {
      errors.push('Entry close date must be before show start date');
    }
  }

  // Validate fees if provided
  if (data.preEntryFee && isNaN(parseFloat(data.preEntryFee.replace(/[$,]/g, '')))) {
    errors.push('Pre-entry fee must be a valid amount');
  }

  if (data.dayOfShowFee && isNaN(parseFloat(data.dayOfShowFee.replace(/[$,]/g, '')))) {
    errors.push('Day of show fee must be a valid amount');
  }

  return errors.length > 0 ? errors : null;
};

// Convert Show to form data
const showToFormData = (show: Partial<Show>): ShowEditFormData => {
  return {
    name: show.name || '',
    status: show.status || 'draft',
    type: show.type || '',
    clubId: show.clubId || '',
    startDate: show.startDate || '',
    endDate: show.endDate || '',
    location: show.location || '',
    chairman: show.chairman || '',
    secretary: show.secretary || '',
    chiefSteward: show.chiefSteward || '',
    entryOpenDate: show.entryOpenDate || '',
    entryCloseDate: show.entryCloseDate || '',
    preEntryFee: show.preEntryFee || '',
    dayOfShowFee: show.dayOfShowFee || '',
    assignedJudges: show.assignedJudges || [],
    maxEntriesPerDog: show.maxEntriesPerDog,
    maxTotalEntries: show.maxTotalEntries,
    allowNonOwnerHandlers: show.allowNonOwnerHandlers,
  };
};

// Convert form data back to Show
const formDataToShow = (formData: ShowEditFormData): Partial<Show> => ({
  name: formData.name,
  status: formData.status,
  type: formData.type,
  clubId: formData.clubId,
  startDate: formData.startDate,
  endDate: formData.endDate,
  location: formData.location,
  chairman: formData.chairman,
  secretary: formData.secretary,
  chiefSteward: formData.chiefSteward,
  entryOpenDate: formData.entryOpenDate,
  entryCloseDate: formData.entryCloseDate,
  preEntryFee: formData.preEntryFee,
  dayOfShowFee: formData.dayOfShowFee,
  assignedJudges: formData.assignedJudges,
  maxEntriesPerDog: formData.maxEntriesPerDog,
  maxTotalEntries: formData.maxTotalEntries,
  allowNonOwnerHandlers: formData.allowNonOwnerHandlers,
});

// Form content component
const ShowEditForm: React.FC = () => {
  const { data, updateData, errors } = useEditPanel<ShowEditFormData>();
  
  // Store data
  const { templates } = useTemplateStore();
  const { clubs } = useClubStore();
  const { people } = useUserStore();

  // Handle input changes
  const handleInputChange = useCallback((field: keyof ShowEditFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    updateData({ [field]: e.target.value });
  }, [updateData]);

  // Handle select changes
  const handleSelectChange = useCallback((field: keyof ShowEditFormData) => (value: string) => {
    updateData({ [field]: value });
  }, [updateData]);

  // Handle checkbox changes
  const handleCheckboxChange = useCallback((field: keyof ShowEditFormData) => (checked: boolean) => {
    updateData({ [field]: checked });
  }, [updateData]);

  // Get available show types from active templates
  const availableShowTypes = useMemo(() => {
    const showTypesSet = new Set<string>();
    
    templates
      .filter(template => template.isActive)
      .forEach(template => {
        let showType: string;
        if (typeof template.showType === 'object') {
          showType = String(Object.values(template.showType)[0] || '');
        } else {
          showType = String(template.showType || '');
        }
        
        if (showType && showType.trim() !== '') {
          showTypesSet.add(showType);
        }
      });
    
    return Array.from(showTypesSet).sort();
  }, [templates]);

  // Get all people for personnel selection
  const allPeople = useMemo(() => {
    return people.map(person => ({
      id: person.id,
      name: `${person.firstName} ${person.lastName}`,
      email: person.email
    }));
  }, [people]);

  // Filter people who have judge qualifications for the selected show type
  const availableJudges = useMemo(() => {
    if (!data.type) return [];
    
    const filtered = people.filter(person => {
      return person.judgeQualifications?.some(qualification => 
        qualification.status === 'Active' && 
        qualification.showTypes.includes(data.type)
      );
    });
    
    return filtered.map(person => ({
      id: person.id,
      name: `${person.firstName} ${person.lastName}`,
      qualifications: person.judgeQualifications || []
    }));
  }, [people, data.type]);

  // Handle judge assignment toggle
  const handleJudgeToggle = useCallback((judgeId: string, judgeName: string, checked: boolean) => {
    if (checked) {
      const newAssignment: ShowJudgeAssignment = {
        judgeId,
        judgeName,
        assignedDate: new Date().toISOString().split('T')[0],
        availableStartTime: 'Full Day',
        availableEndTime: 'Full Day'
      };
      const updatedJudges = [...data.assignedJudges, newAssignment];
      updateData({ assignedJudges: updatedJudges });
    } else {
      const updatedJudges = data.assignedJudges.filter(judge => judge.judgeId !== judgeId);
      updateData({ assignedJudges: updatedJudges });
    }
  }, [data.assignedJudges, updateData]);
  
  return (
    <div className="space-y-6 p-6">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 transition-all duration-300 ease-out">
          <TabsTrigger 
            value="basic" 
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Calendar className="h-4 w-4" />
            Basic Info
          </TabsTrigger>
          <TabsTrigger 
            value="personnel" 
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Users className="h-4 w-4" />
            Personnel
          </TabsTrigger>
          <TabsTrigger 
            value="judges" 
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <UserCheck className="h-4 w-4" />
            Judges
          </TabsTrigger>
          <TabsTrigger 
            value="fees" 
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <DollarSign className="h-4 w-4" />
            Fees
          </TabsTrigger>
        </TabsList>

        {/* Basic Information Tab */}
        <TabsContent value="basic" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out">
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Show Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Show Name *</Label>
                  <Input
                    id="name"
                    value={data.name}
                    onChange={handleInputChange('name')}
                    placeholder="Enter show name"
                    className={cn(
                      errors.some(e => e.includes('Show name')) && 'border-destructive'
                    )}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="type" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Show Type</Label>
                  <Select value={data.type} onValueChange={handleSelectChange('type')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableShowTypes.length > 0 ? (
                        availableShowTypes.map(showType => (
                          <SelectItem key={showType} value={showType}>
                            {showType}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-templates" disabled className="text-sm text-muted-foreground italic">
                          No active templates available. Please create templates first.
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="status" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Status</Label>
                  <Select value={data.status} onValueChange={handleSelectChange('status')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">
                        <div>
                          <div className="font-medium">Draft</div>
                          <div className="text-xs text-muted-foreground">Work in progress - only visible to you</div>
                        </div>
                      </SelectItem>
                      <SelectItem value="unpublished">
                        <div>
                          <div className="font-medium">Ready (Unpublished)</div>
                          <div className="text-xs text-muted-foreground">Complete but not visible to exhibitors</div>
                        </div>
                      </SelectItem>
                      <SelectItem value="published">
                        <div>
                          <div className="font-medium">Published</div>
                          <div className="text-xs text-muted-foreground">Live and accepting registrations</div>
                        </div>
                      </SelectItem>
                      <SelectItem value="cancelled">
                        <div>
                          <div className="font-medium text-red-600">Cancelled</div>
                          <div className="text-xs text-muted-foreground">Show has been cancelled</div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {data.status === 'published' && data.startDate && (
                    <p className="text-xs text-muted-foreground">
                      Show is {new Date() < new Date(data.startDate) ? 'upcoming' : 
                        new Date() > new Date(data.endDate || data.startDate) ? 'completed' : 'in progress'}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="clubId" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Hosting Club *</Label>
                <Select value={data.clubId} onValueChange={handleSelectChange('clubId')}>
                  <SelectTrigger className={cn(
                    errors.some(e => e.includes('club')) && 'border-destructive'
                  )}>
                    <SelectValue placeholder="Select hosting club" />
                  </SelectTrigger>
                  <SelectContent>
                    {clubs.length > 0 ? (
                      clubs.map(club => (
                        <SelectItem key={club.id} value={club.id}>
                          {club.name} ({club.clubNumber})
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-clubs" disabled className="text-sm text-muted-foreground italic">
                        No clubs available. Add clubs in the Clubs section.
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="location" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Location</Label>
                <Input
                  id="location"
                  value={data.location}
                  onChange={handleInputChange('location')}
                  placeholder="Enter show location"
                />
              </div>

              <Separator />
              
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Important Dates
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Start Date *</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={data.startDate}
                      onChange={handleInputChange('startDate')}
                      className={cn(
                        errors.some(e => e.includes('Start date')) && 'border-destructive'
                      )}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="endDate" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">End Date *</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={data.endDate}
                      onChange={handleInputChange('endDate')}
                      className={cn(
                        errors.some(e => e.includes('End date')) && 'border-destructive'
                      )}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="entryOpenDate" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Entry Open Date</Label>
                    <Input
                      id="entryOpenDate"
                      type="date"
                      value={data.entryOpenDate}
                      onChange={handleInputChange('entryOpenDate')}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="entryCloseDate" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Entry Close Date</Label>
                    <Input
                      id="entryCloseDate"
                      type="date"
                      value={data.entryCloseDate}
                      onChange={handleInputChange('entryCloseDate')}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Personnel Tab */}
        <TabsContent value="personnel" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out">
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Key Personnel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="chairman" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Chairman</Label>
                  <Select value={data.chairman} onValueChange={handleSelectChange('chairman')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select chairman" />
                    </SelectTrigger>
                    <SelectContent>
                      {allPeople.length > 0 ? (
                        allPeople.map(person => (
                          <SelectItem key={person.id} value={person.name}>
                            {person.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-people" disabled className="text-sm text-muted-foreground italic">
                          No people available. Add people in the Users section.
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="secretary" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Secretary</Label>
                  <Select value={data.secretary} onValueChange={handleSelectChange('secretary')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select secretary" />
                    </SelectTrigger>
                    <SelectContent>
                      {allPeople.length > 0 ? (
                        allPeople.map(person => (
                          <SelectItem key={person.id} value={person.name}>
                            {person.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-people" disabled className="text-sm text-muted-foreground italic">
                          No people available. Add people in the Users section.
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="chiefSteward" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Chief Steward</Label>
                  <Select value={data.chiefSteward} onValueChange={handleSelectChange('chiefSteward')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select chief steward" />
                    </SelectTrigger>
                    <SelectContent>
                      {allPeople.length > 0 ? (
                        allPeople.map(person => (
                          <SelectItem key={person.id} value={person.name}>
                            {person.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-people" disabled className="text-sm text-muted-foreground italic">
                          No people available. Add people in the Users section.
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Judges Tab */}
        <TabsContent value="judges" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out">
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Judge Assignments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.type ? (
                availableJudges.length > 0 ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Select judges qualified for {data.type} shows:
                    </p>
                    {availableJudges.map((judge) => {
                      const isAssigned = data.assignedJudges.some(aj => aj.judgeId === judge.id);
                      
                      return (
                        <div key={judge.id} className="border rounded-xl p-4 bg-muted/30 transition-all duration-200">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`judge-${judge.id}`}
                              checked={isAssigned}
                              onCheckedChange={(checked) => 
                                handleJudgeToggle(judge.id, judge.name, checked as boolean)
                              }
                            />
                            <div className="flex-1">
                              <label 
                                htmlFor={`judge-${judge.id}`}
                                className="font-medium cursor-pointer"
                              >
                                {judge.name}
                              </label>
                              <div className="text-sm text-muted-foreground mt-1">
                                {judge.qualifications
                                  .filter(q => q.showTypes.includes(data.type) && q.status === 'Active')
                                  .map(q => `${q.organization} Judge #${q.judgeNumber}`)
                                  .join(', ')
                                }
                              </div>
                              
                              {isAssigned && (
                                <div className="text-sm text-green-600 dark:text-green-400 mt-2 font-medium">
                                  ✓ Assigned to show
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {data.assignedJudges.length > 0 && (
                      <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/30 p-4 rounded-xl">
                        <strong>{data.assignedJudges.length} judge(s) assigned.</strong> These judges will be available for class assignments when creating trials.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950/30 p-4 rounded-xl">
                    <p className="mb-2">No qualified judges found for {data.type} shows.</p>
                    <p className="text-xs">You can assign judges later or add judge qualifications to people in the Users section.</p>
                  </div>
                )
              ) : (
                <div className="text-sm text-muted-foreground text-center py-8">
                  <UserCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Select Show Type First</h3>
                  <p>Select a show type in the Basic Info tab to see available judges.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fees Tab */}
        <TabsContent value="fees" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out">
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Entry Fees
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="preEntryFee" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Pre-Entry Fee</Label>
                  <Input
                    id="preEntryFee"
                    value={data.preEntryFee}
                    onChange={handleInputChange('preEntryFee')}
                    placeholder="$25.00"
                    className={cn(
                      errors.some(e => e.includes('Pre-entry fee')) && 'border-destructive'
                    )}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="dayOfShowFee" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Day of Show Fee</Label>
                  <Input
                    id="dayOfShowFee"
                    value={data.dayOfShowFee}
                    onChange={handleInputChange('dayOfShowFee')}
                    placeholder="$35.00"
                    className={cn(
                      errors.some(e => e.includes('Day of show fee')) && 'border-destructive'
                    )}
                  />
                </div>
              </div>
              
              <p className="text-sm text-muted-foreground">
                These fees will be used as defaults for each class and can be adjusted per class as needed.
              </p>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Entry Limits (Optional)
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="maxEntriesPerDog" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Max Entries Per Dog</Label>
                    <Input
                      id="maxEntriesPerDog"
                      type="number"
                      value={data.maxEntriesPerDog || ''}
                      onChange={handleInputChange('maxEntriesPerDog')}
                      placeholder="Unlimited"
                      min="1"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="maxTotalEntries" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Max Total Entries</Label>
                    <Input
                      id="maxTotalEntries"
                      type="number"
                      value={data.maxTotalEntries || ''}
                      onChange={handleInputChange('maxTotalEntries')}
                      placeholder="Unlimited"
                      min="1"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="allowNonOwnerHandlers"
                    checked={data.allowNonOwnerHandlers || false}
                    onCheckedChange={handleCheckboxChange('allowNonOwnerHandlers')}
                  />
                  <Label htmlFor="allowNonOwnerHandlers" className="text-sm font-medium">
                    Allow non-owner handlers
                  </Label>
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
export const ShowEditPanel: React.FC<ShowEditPanelProps> = ({
  open,
  onClose,
  showName,
  initialShowData,
  onSave,
  enableAutoSave = false,
}) => {
  // Convert show data to form data
  const initialFormData = useMemo(() => showToFormData(initialShowData), [initialShowData]);
  
  // Handle save
  const handleSave = useCallback(async (formData: ShowEditFormData) => {
    const showData = formDataToShow(formData);
    if (onSave) {
      await onSave(showData);
    }
  }, [onSave]);

  return (
    <EditPanelWrapper<ShowEditFormData>
      open={open}
      onClose={onClose}
      title="Edit Show"
      subtitle={`Editing details for ${showName}`}
      size="xl"
      initialData={initialFormData}
      onSave={handleSave}
      validateData={validateShowData}
      enableAutoSave={enableAutoSave}
      saveLabel="Save Changes"
      cancelLabel="Cancel"
    >
      <ShowEditForm />
    </EditPanelWrapper>
  );
};

export default ShowEditPanel;