import React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
} from "@myk9/ui";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTemplateStore } from "@/store/templateStore";
import { useClubStore } from "@/store/clubStore";
import { useUserStore } from "@/store/userStore";
import { ShowJudgeAssignment } from "@/types/judge-types";
import { logger } from '@/services/LoggingService';

export interface ShowFormData {
  name: string;
  status: string;
  type: string;
  clubId: string; // ✅ Added club selection
  startDate: string;
  endDate: string;
  chairman: string;
  secretary: string;
  chiefSteward: string;
  entryOpenDate: string;
  entryCloseDate: string;
  preEntryFee: string;
  dayOfShowFee: string; // Fee for registrations made on the day of the show (typically higher)
  assignedJudges: ShowJudgeAssignment[];
}

interface EditShowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: ShowFormData;
  handleInputChange: (field: keyof Omit<ShowFormData, 'assignedJudges'>, value: string) => void;
  onJudgeAssignmentChange: (assignedJudges: ShowJudgeAssignment[]) => void;
  onSave: () => void;
}

const EditShowDialog: React.FC<EditShowDialogProps> = ({ open, onOpenChange, formData, handleInputChange, onJudgeAssignmentChange, onSave }) => {
  // Get available show types from active templates
  const { templates } = useTemplateStore();
  
  // Get people who are judges
  const { people, setPeople: _setPeople } = useUserStore();
  
  // Get all people for personnel selection (chairman, secretary, steward)
  const allPeople = React.useMemo(() => {
    logger.debug('EditShowDialog people data', 'shows', {
      peopleLength: people?.length || 0,
      hasFirstPerson: !!people?.[0]
    });

    return people.map(person => ({
      id: person.id,
      name: `${person.firstName} ${person.lastName}`,
      email: person.email
    }));
  }, [people]);
  
  // Filter people who have judge qualifications for the selected show type
  const availableJudges = React.useMemo(() => {
    if (!formData.type) return [];
    
    const filtered = people.filter(person => {
      return person.judgeQualifications?.some(qualification => 
        qualification.status === 'Active' && 
        qualification.showTypes.includes(formData.type)
      );
    });
    
    return filtered.map(person => ({
      id: person.id,
      name: `${person.firstName} ${person.lastName}`,
      qualifications: person.judgeQualifications || []
    }));
  }, [people, formData.type]);
  
  // Handle judge assignment toggle
  const handleJudgeToggle = (judgeId: string, judgeName: string, checked: boolean) => {
    if (checked) {
      // Add judge
      const newAssignment: ShowJudgeAssignment = {
        judgeId,
        judgeName,
        assignedDate: new Date().toISOString().split('T')[0],
        availableStartTime: 'Full Day',
        availableEndTime: 'Full Day'
      };
      const updatedJudges = [...formData.assignedJudges, newAssignment];
      onJudgeAssignmentChange(updatedJudges);
    } else {
      // Remove judge
      const updatedJudges = formData.assignedJudges.filter(judge => judge.judgeId !== judgeId);
      onJudgeAssignmentChange(updatedJudges);
    }
  };
  
  // Templates will be automatically initialized by the store on app start
  // No need to initialize here to avoid duplicates
  
  const availableShowTypes = React.useMemo(() => {
    // Get unique show types from active templates only
    const showTypesSet = new Set<string>();
    
    templates
      .filter(template => template.isActive)
      .forEach(template => {
        // Handle enum values properly - could be string or enum object
        let showType: string;
        if (typeof template.showType === 'object') {
          // If it's an enum object, get the string value
          showType = String(Object.values(template.showType)[0] || '');
        } else {
          showType = String(template.showType || '');
        }
        
        if (showType && showType.trim() !== '') {
          showTypesSet.add(showType);
        }
      });
    
    // Convert Set to sorted array
    const uniqueShowTypes = Array.from(showTypesSet).sort();

    // Debug logging
    logger.debug('EditShowDialog templates and show types', 'shows', {
      templatesCount: templates.length,
      activeTemplatesCount: templates.filter(t => t.isActive).length,
      availableShowTypes: uniqueShowTypes
    });

    // If no templates are configured, return empty array with a message
    return uniqueShowTypes;
  }, [templates]);

  // Get available clubs
  const clubs = useClubStore(state => state.clubs);
  
  // Debug: log clubs to see if they're loaded
  React.useEffect(() => {
    logger.debug('Available clubs', 'shows', { clubsCount: clubs.length });
  }, [clubs]);

  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleSave = () => {
    onSave();
    // Don't close the dialog here - let the parent component handle closing after successful save
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="2xl">
        <SheetHeader>
          <SheetTitle>Edit Show</SheetTitle>
        </SheetHeader>

        <SheetBody>
          {/* First Row - Show Name, Show Type, Status */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="form-field">
              <label className="form-label required">Show Name</label>
              <Input
                value={formData.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Enter show name"
                className="form-input h-10"
              />
            </div>
            <div className="form-field">
              <label className="form-label">Show Type</label>
              <Select value={formData.type || ''} onValueChange={(value) => handleInputChange('type', value)}>
                <SelectTrigger className="form-select h-10">
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
            <div className="form-field">
              <label className="form-label">Status</label>
              <Select value={formData.status || ''} onValueChange={(value) => handleInputChange('status', value)}>
                <SelectTrigger className="form-select h-10">
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
              <p className="text-xs text-muted-foreground mt-1">
                {formData.status === 'published' && 
                  `Show is ${new Date() < new Date(formData.startDate) ? 'upcoming' : 
                    new Date() > new Date(formData.endDate) ? 'completed' : 'in progress'}`}
              </p>
            </div>
          </div>

          {/* Second Row - Club and Personnel */}
          <div className="mb-6">
            <h3 className="form-section-title">Hosting Club & Key Personnel</h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="form-field">
                <label className="form-label required">Hosting Club</label>
                <Select value={formData.clubId || ''} onValueChange={(value) => handleInputChange('clubId', value)}>
                  <SelectTrigger className="form-select h-10">
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
                      <>
                        <SelectItem value="sample-club-1">Sample Dog Club (123)</SelectItem>
                        <SelectItem value="sample-club-2">Metro Canine Club (456)</SelectItem>
                        <SelectItem value="sample-club-3">City Kennel Club (789)</SelectItem>
                        <SelectItem value="tip-add-clubs" disabled className="text-xs text-muted-foreground italic">
                          💡 Tip: Add clubs in Clubs section for real data
                        </SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="form-field">
                <label className="form-label">Chairman</label>
                <Select value={formData.chairman || ''} onValueChange={(value) => handleInputChange('chairman', value)}>
                  <SelectTrigger className="form-select h-10">
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
              <div className="form-field">
                <label className="form-label">Secretary</label>
                <Select value={formData.secretary || ''} onValueChange={(value) => handleInputChange('secretary', value)}>
                  <SelectTrigger className="form-select h-10">
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
              <div className="form-field">
                <label className="form-label">Chief Steward</label>
                <Select value={formData.chiefSteward || ''} onValueChange={(value) => handleInputChange('chiefSteward', value)}>
                  <SelectTrigger className="form-select h-10">
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
          </div>
          
          {/* Date Fields Section */}
          <div className="mb-6">
            <h3 className="form-section-title">Important Dates</h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="form-field">
                <label className="form-label required">Start Date</label>
                <Input
                  type="date"
                  value={formData.startDate || ''}
                  onChange={(e) => handleInputChange('startDate', e.target.value)}
                  className="form-input h-10"
                />
              </div>
              <div className="form-field">
                <label className="form-label">End Date</label>
                <Input
                  type="date"
                  value={formData.endDate || ''}
                  onChange={(e) => handleInputChange('endDate', e.target.value)}
                  className="form-input h-10"
                />
              </div>
              <div className="form-field">
                <label className="form-label">Entry Open Date</label>
                <Input
                  type="date"
                  value={formData.entryOpenDate || ''}
                  onChange={(e) => handleInputChange('entryOpenDate', e.target.value)}
                  className="form-input h-10"
                />
              </div>
              <div className="form-field">
                <label className="form-label">Entry Close Date</label>
                <Input
                  type="date"
                  value={formData.entryCloseDate || ''}
                  onChange={(e) => handleInputChange('entryCloseDate', e.target.value)}
                  className="form-input h-10"
                />
              </div>
            </div>
          </div>
          
          {/* Judge Assignment Section */}
          <div className="mb-6">
            <h3 className="form-section-title">Assign Judges</h3>
            {formData.type ? (
              availableJudges.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Select judges qualified for {formData.type} shows:
                  </p>
                  {availableJudges.map((judge) => {
                    const isAssigned = formData.assignedJudges.some(aj => aj.judgeId === judge.id);
                    
                    return (
                      <div key={judge.id} className="border rounded-lg p-4 bg-muted/30">
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
                                .filter(q => q.showTypes.includes(formData.type) && q.status === 'Active')
                                .map(q => `${q.organization} Judge #${q.judgeNumber}`)
                                .join(', ')
                              }
                            </div>
                            
                            {/* Show assignment confirmation for selected judges */}
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
                  
                  {formData.assignedJudges.length > 0 && (
                    <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg">
                      <strong>{formData.assignedJudges.length} judge(s) assigned.</strong> These judges will be available for class assignments when creating trials.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg">
                  <p className="mb-2">No qualified judges found for {formData.type} shows.</p>
                  <p className="mb-3 text-xs">If you recently updated judge qualifications, you may need to refresh the data:</p>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      // Reload people from database instead of using mock data
                      const { loadUsers } = useUserStore.getState();
                      loadUsers().catch((error) => logger.error('Failed to load users', 'shows', {}, error as Error));
                    }}
                    className="text-xs"
                  >
                    Refresh Users Data
                  </Button>
                  <p className="mt-2 text-xs">Or you can assign judges later or add judge qualifications to people in the Users section.</p>
                </div>
              )
            ) : (
              <div className="text-sm text-muted-foreground">
                Select a show type first to see available judges.
              </div>
            )}
          </div>
          
          {/* Fee Section */}
          <div>
            <h3 className="form-section-title">Default Entry Fees</h3>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <div className="form-field">
                <label className="form-label">Pre-Entry Fee</label>
                <Input
                  value={formData.preEntryFee || ''}
                  onChange={(e) => handleInputChange('preEntryFee', e.target.value)}
                  placeholder="$25.00"
                  className="form-input h-10"
                />
              </div>
              <div className="form-field">
                <label className="form-label">Day of Show Fee</label>
                <Input
                  value={formData.dayOfShowFee || ''}
                  onChange={(e) => handleInputChange('dayOfShowFee', e.target.value)}
                  placeholder="$35.00"
                  className="form-input h-10"
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              These fees will be used as defaults for each class and can be adjusted per class as needed.
            </p>
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default EditShowDialog;