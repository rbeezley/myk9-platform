import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetFooter, SheetTitle } from '@myk9/ui';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { useTemplateStore } from '@/store/templateStore';
import { useClubStore } from '@/store/clubStore';
import { useUserStore } from '@/store/userStore';
import { ShowJudgeAssignment } from '@/types/judge-types';
import { logger } from '@/services/LoggingService';
import { untypedFrom } from '@/services/database/queries/search-query-helpers';

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
  confirmationMessage?: string; // Optional message included in registration confirmation emails
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

const EditShowDialog: React.FC<EditShowDialogProps> = ({
  open,
  onOpenChange,
  formData,
  handleInputChange,
  onJudgeAssignmentChange,
  onSave,
}) => {
  // Get available show types from active templates
  const { templates } = useTemplateStore();

  // Get people who are judges
  const { people, loadUsers } = useUserStore();

  // Get all people for personnel selection (chairman, secretary, steward)
  const allPeople = React.useMemo(() => {
    logger.debug('EditShowDialog people data', 'shows', {
      peopleLength: people?.length || 0,
      hasFirstPerson: !!people?.[0],
    });

    return people.map(person => ({
      id: person.id,
      name: `${person.firstName} ${person.lastName}`,
      email: person.email,
    }));
  }, [people]);

  // Query judges with active qualifications for the selected show type (organization)
  const [availableJudges, setAvailableJudges] = React.useState<
    {
      id: string;
      name: string;
      qualifications: { organization: string; disciplines: string[]; judge_number?: string }[];
    }[]
  >([]);

  React.useEffect(() => {
    if (!formData.type) {
      setAvailableJudges([]);
      return;
    }

    const fetchJudges = async () => {
      const { data, error } = await untypedFrom('judge_qualifications')
        .select(
          'person_id, organization, disciplines, judge_number, people!inner(first_name, last_name)'
        )
        .contains('disciplines', [formData.type])
        .eq('is_active', true);

      if (error || !data) {
        logger.error('Failed to fetch qualified judges', 'shows', {}, error as unknown as Error);
        setAvailableJudges([]);
        return;
      }

      // Group by person
      const byPerson = new Map<
        string,
        {
          id: string;
          name: string;
          qualifications: { organization: string; disciplines: string[]; judge_number?: string }[];
        }
      >();
      for (const row of data) {
        const personData = row.people as unknown as { first_name: string; last_name: string };
        const personId = row.person_id;
        if (!byPerson.has(personId)) {
          byPerson.set(personId, {
            id: personId,
            name: `${personData.first_name || ''} ${personData.last_name || ''}`.trim(),
            qualifications: [],
          });
        }
        byPerson.get(personId)!.qualifications.push({
          organization: row.organization,
          disciplines: row.disciplines || [],
          judge_number: row.judge_number ?? undefined,
        });
      }
      setAvailableJudges(Array.from(byPerson.values()));
    };

    fetchJudges();
  }, [formData.type]);

  // Handle judge assignment toggle
  const handleJudgeToggle = (judgeId: string, judgeName: string, checked: boolean) => {
    if (checked) {
      // Add judge
      const newAssignment: ShowJudgeAssignment = {
        judgeId,
        judgeName,
        assignedDate: new Date().toISOString().split('T')[0],
        availableStartTime: 'Full Day',
        availableEndTime: 'Full Day',
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
        let trialType: string;
        if (typeof template.trialType === 'object') {
          // If it's an enum object, get the string value
          trialType = String(Object.values(template.trialType)[0] || '');
        } else {
          trialType = String(template.trialType || '');
        }

        if (trialType && trialType.trim() !== '') {
          showTypesSet.add(trialType);
        }
      });

    // Convert Set to sorted array
    const uniqueShowTypes = Array.from(showTypesSet).sort();

    // Debug logging
    logger.debug('EditShowDialog templates and show types', 'shows', {
      templatesCount: templates.length,
      activeTemplatesCount: templates.filter(t => t.isActive).length,
      availableShowTypes: uniqueShowTypes,
    });

    // If no templates are configured, return empty array with a message
    return uniqueShowTypes;
  }, [templates]);

  // Get available clubs
  const { clubs, loadClubs } = useClubStore();

  // Ensure clubs and people are loaded when the dialog opens
  React.useEffect(() => {
    if (clubs.length === 0) loadClubs();
    if (people.length === 0) loadUsers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- load once on mount

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
                onChange={e => handleInputChange('name', e.target.value)}
                placeholder="Enter show name"
                className="form-input h-10"
              />
            </div>
            <div className="form-field">
              <label className="form-label">Show Type</label>
              <Select
                value={formData.type || ''}
                onValueChange={value => handleInputChange('type', value)}
              >
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
                    <SelectItem
                      value="no-templates"
                      disabled
                      className="text-sm text-muted-foreground italic"
                    >
                      No active templates available. Please create templates first.
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="form-field">
              <label className="form-label">Status</label>
              <Select
                value={formData.status || ''}
                onValueChange={value => handleInputChange('status', value)}
              >
                <SelectTrigger className="form-select h-10">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft — not visible to exhibitors</SelectItem>
                  <SelectItem value="published">Published — live and accepting entries</SelectItem>
                  <SelectItem value="upcoming">Upcoming — entries closed</SelectItem>
                  <SelectItem value="in_progress">In Progress — show is running</SelectItem>
                  <SelectItem value="completed">Completed — results finalized</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Second Row - Club and Personnel */}
          <div className="mb-6">
            <h3 className="form-section-title">Hosting Club & Key Personnel</h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="form-field">
                <label className="form-label required">Hosting Club</label>
                <Select
                  value={formData.clubId || ''}
                  onValueChange={value => handleInputChange('clubId', value)}
                >
                  <SelectTrigger className="form-select h-10">
                    <SelectValue placeholder="Select hosting club">
                      {formData.clubId
                        ? (() => {
                            const club = clubs.find(c => c.id === formData.clubId);
                            return club ? `${club.name} (${club.clubNumber})` : 'Loading...';
                          })()
                        : undefined}
                    </SelectValue>
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
                        <SelectItem
                          value="tip-add-clubs"
                          disabled
                          className="text-xs text-muted-foreground italic"
                        >
                          💡 Tip: Add clubs in Clubs section for real data
                        </SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="form-field">
                <label className="form-label">Chairman</label>
                <Select
                  value={formData.chairman || ''}
                  onValueChange={value => handleInputChange('chairman', value)}
                >
                  <SelectTrigger className="form-select h-10">
                    <SelectValue placeholder="Select chairman">
                      {formData.chairman
                        ? (allPeople.find(p => p.id === formData.chairman)?.name ?? 'Loading...')
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {allPeople.length > 0 ? (
                      allPeople.map(person => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem
                        value="no-people"
                        disabled
                        className="text-sm text-muted-foreground italic"
                      >
                        No people available. Add people in the Users section.
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="form-field">
                <label className="form-label">Secretary</label>
                <Select
                  value={formData.secretary || ''}
                  onValueChange={value => handleInputChange('secretary', value)}
                >
                  <SelectTrigger className="form-select h-10">
                    <SelectValue placeholder="Select secretary">
                      {formData.secretary
                        ? (allPeople.find(p => p.id === formData.secretary)?.name ?? 'Loading...')
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {allPeople.length > 0 ? (
                      allPeople.map(person => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem
                        value="no-people"
                        disabled
                        className="text-sm text-muted-foreground italic"
                      >
                        No people available. Add people in the Users section.
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="form-field">
                <label className="form-label">Chief Steward</label>
                <Select
                  value={formData.chiefSteward || ''}
                  onValueChange={value => handleInputChange('chiefSteward', value)}
                >
                  <SelectTrigger className="form-select h-10">
                    <SelectValue placeholder="Select chief steward">
                      {formData.chiefSteward
                        ? (allPeople.find(p => p.id === formData.chiefSteward)?.name ??
                          'Loading...')
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {allPeople.length > 0 ? (
                      allPeople.map(person => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem
                        value="no-people"
                        disabled
                        className="text-sm text-muted-foreground italic"
                      >
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
                <DateTimePicker
                  value={formData.startDate ? new Date(formData.startDate) : undefined}
                  onChange={date => {
                    if (date) handleInputChange('startDate', date.toISOString());
                  }}
                  placeholder="Select start date"
                  showTime={true}
                />
              </div>
              <div className="form-field">
                <label className="form-label">End Date</label>
                <DateTimePicker
                  value={formData.endDate ? new Date(formData.endDate) : undefined}
                  onChange={date => {
                    if (date) handleInputChange('endDate', date.toISOString());
                  }}
                  placeholder="Select end date"
                  showTime={true}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Entry Open Date</label>
                <DateTimePicker
                  value={formData.entryOpenDate ? new Date(formData.entryOpenDate) : undefined}
                  onChange={date => {
                    if (date) handleInputChange('entryOpenDate', date.toISOString());
                  }}
                  placeholder="Select entry open date"
                  showTime={true}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Entry Close Date</label>
                <DateTimePicker
                  value={formData.entryCloseDate ? new Date(formData.entryCloseDate) : undefined}
                  onChange={date => {
                    if (date) handleInputChange('entryCloseDate', date.toISOString());
                  }}
                  placeholder="Select entry close date"
                  showTime={true}
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
                  {availableJudges.map(judge => {
                    const isAssigned = formData.assignedJudges.some(aj => aj.judgeId === judge.id);

                    return (
                      <div key={judge.id} className="border rounded-lg p-4 bg-muted/30">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={`judge-${judge.id}`}
                            checked={isAssigned}
                            onCheckedChange={checked =>
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
                                .map(q => {
                                  const parts = [q.organization];
                                  if (q.judge_number) parts.push(`#${q.judge_number}`);
                                  if (q.disciplines?.length)
                                    parts.push(`— ${q.disciplines.join(', ')}`);
                                  return parts.join(' ');
                                })
                                .join('; ')}
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
                      <strong>{formData.assignedJudges.length} judge(s) assigned.</strong> These
                      judges will be available for class assignments when creating trials.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg">
                  <p className="mb-2">No qualified judges found for {formData.type} shows.</p>
                  <p className="mb-3 text-xs">
                    If you recently updated judge qualifications, you may need to refresh the data:
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // Reload people from database instead of using mock data
                      const { loadUsers } = useUserStore.getState();
                      loadUsers().catch(error =>
                        logger.error('Failed to load users', 'shows', {}, error as Error)
                      );
                    }}
                    className="text-xs"
                  >
                    Refresh Users Data
                  </Button>
                  <p className="mt-2 text-xs">
                    Or you can assign judges later or add judge qualifications to people in the
                    Users section.
                  </p>
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
                <CurrencyInput
                  value={formData.preEntryFee}
                  onChange={v => handleInputChange('preEntryFee', String(v))}
                  placeholder="0.00"
                  className="form-input h-10"
                />
              </div>
              <div className="form-field">
                <label className="form-label">Day of Show Fee</label>
                <CurrencyInput
                  value={formData.dayOfShowFee}
                  onChange={v => handleInputChange('dayOfShowFee', String(v))}
                  placeholder="0.00"
                  className="form-input h-10"
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              These fees will be used as defaults for each class and can be adjusted per class as
              needed.
            </p>
          </div>

          {/* Confirmation Message Section */}
          <div className="mt-6">
            <h3 className="form-section-title">Email Settings</h3>
            <div className="space-y-2">
              <label htmlFor="confirmationMessage" className="text-sm font-medium">
                Confirmation Message
              </label>
              <textarea
                id="confirmationMessage"
                value={formData.confirmationMessage || ''}
                onChange={e => handleInputChange('confirmationMessage', e.target.value)}
                placeholder="Optional message included in registration confirmation emails (e.g., parking info, what to bring)"
                className="w-full min-h-[80px] p-2 border border-input rounded-md bg-background text-foreground text-sm"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                This message will be included in registration confirmation emails sent to
                exhibitors.
              </p>
            </div>
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default EditShowDialog;
