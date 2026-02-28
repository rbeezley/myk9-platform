import React, { useEffect, useState } from 'react';
import { logger } from '@/services/LoggingService';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Button } from '@/components/ui/button';
import { Plus, Search, HelpCircle, X, GraduationCap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { isAfter, subDays } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { useWizardStore } from '@/store/wizardStore';
import { useClubStore } from '@/store/clubStore';
import { useUserStore } from '@/store/userStore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePanelManager } from '@/components/panels/hooks';

interface ShowDetailsStepProps {
  className?: string;
}

const SHOW_TYPES = [
  { value: 'AKC', label: 'AKC (American Kennel Club)' },
  { value: 'UKC', label: 'UKC (United Kennel Club)' },
  { value: 'NASDA', label: 'NASDA (North American Sport Dog Association)' },
  { value: 'Other', label: 'Other' },
];

export const ShowDetailsStep: React.FC<ShowDetailsStepProps> = ({ className }) => {
  logger.debug('ShowDetailsStep component loaded', 'wizard');
  const { show, updateShowData, addJudgeToShow, removeJudgeFromShow, judgeDetails } =
    useWizardStore();
  const { clubs, loadClubs, syncClubs } = useClubStore();
  const { people, loadPeople } = useUserStore();
  const panelManager = usePanelManager();

  // Ensure clubs are available — try local cache first, then fetch from Supabase
  useEffect(() => {
    if (clubs.length === 0) {
      loadClubs().then(() => {
        // If IndexedDB was empty (e.g. after clearing site data), sync from Supabase
        if (useClubStore.getState().clubs.length === 0) {
          syncClubs();
        }
      });
    }
  }, [clubs.length, loadClubs, syncClubs]);

  // Search states
  const [clubSearchTerm, setClubSearchTerm] = useState('');
  const [showClubSearch, setShowClubSearch] = useState(false);
  const [judgeSearchTerm, setJudgeSearchTerm] = useState('');
  const [showJudgeSearch, setShowJudgeSearch] = useState(false);

  // Filter clubs based on search term
  const filteredClubs = React.useMemo(() => {
    if (!clubSearchTerm.trim()) return clubs;
    return clubs.filter(
      club =>
        club.name.toLowerCase().includes(clubSearchTerm.toLowerCase()) ||
        club.email.toLowerCase().includes(clubSearchTerm.toLowerCase()) ||
        `${club.address.city}, ${club.address.state}`
          .toLowerCase()
          .includes(clubSearchTerm.toLowerCase())
    );
  }, [clubs, clubSearchTerm]);

  // Filter people for chairman/secretary - only show those with relevant roles
  const filteredPeople = React.useMemo(() => {
    return people
      .filter(
        person =>
          person.roles?.includes('chairman') ||
          person.roles?.includes('secretary') ||
          person.roles?.includes('admin') ||
          person.roles?.includes('steward')
      )
      .sort((a, b) => {
        const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
        const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [people]);

  // Filter people with judge role, excluding already-selected judges
  const availableJudges = React.useMemo(() => {
    return people
      .filter(person => person.roles?.includes('judge') && !show.judgeIds.includes(person.id))
      .filter(judge => {
        if (!judgeSearchTerm.trim()) return true;
        const term = judgeSearchTerm.toLowerCase();
        const fullName = `${judge.firstName} ${judge.lastName}`.toLowerCase();
        const judgeNumber = judge.judgeInfo?.judgeNumber?.toLowerCase() || '';
        return fullName.includes(term) || judgeNumber.includes(term);
      })
      .sort((a, b) => {
        const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
        const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [people, show.judgeIds, judgeSearchTerm]);

  // Look up a person's display name by ID.
  // Used to pass explicit labels to SelectValue since Base UI can't resolve
  // value→label when Portal-rendered items are unmounted.
  const getPersonName = (id: string | undefined) => {
    if (!id) return undefined;
    const person = people.find(p => p.id === id);
    return person ? `${person.firstName} ${person.lastName}` : undefined;
  };

  // Resolve selected judge IDs to people records
  const selectedJudges = React.useMemo(() => {
    return show.judgeIds.map(id => {
      const person = people.find(p => p.id === id);
      const details = judgeDetails[id];
      return {
        id,
        name: person ? `${person.firstName} ${person.lastName}` : details?.name || 'Unknown Judge',
        judgeNumber: person?.judgeInfo?.judgeNumber || '',
      };
    });
  }, [show.judgeIds, people, judgeDetails]);

  // Handlers for opening creation panels
  const handleCreateClub = () => {
    panelManager.openPanel({
      type: 'club',
      title: 'Create New Club',
      subtitle: 'Add a new club to host this show',
      context: {
        entityType: 'club',
        mode: 'create',
        selectionCallback: async (entity: Record<string, unknown>) => {
          const club = entity as { id: string; name: string };
          updateShowData({ clubId: club.id });
          // Refresh the clubs list so the new club appears in the dropdown
          await loadClubs();
          logger.debug('Club created and selected', 'wizard', { clubName: club.name });
        },
      },
    });
  };

  const handleCreateChairman = () => {
    logger.debug('CREATE CHAIRMAN button clicked', 'wizard');
    panelManager.openPanel({
      type: 'person',
      title: 'Create New Chairman',
      subtitle: 'Add a new person to serve as show chairman',
      context: {
        entityType: 'person',
        mode: 'create',
        preFilledData: {
          role: 'chairman',
          roleLabel: 'Chairman',
        },
        selectionCallback: async (person: Record<string, unknown>) => {
          updateShowData({ chairman: person.id as string });
          // Refresh the people list so the new person appears in the dropdown
          await loadPeople();
          logger.debug('Chairman created and selected', 'wizard', { chairmanId: person.id });
        },
      },
    });
  };

  const handleCreateSecretary = () => {
    logger.debug('CREATE SECRETARY button clicked', 'wizard');
    panelManager.openPanel({
      type: 'person',
      title: 'Create New Secretary',
      subtitle: 'Add a new person to serve as show secretary',
      context: {
        entityType: 'person',
        mode: 'create',
        preFilledData: {
          role: 'secretary',
          roleLabel: 'Secretary',
        },
        selectionCallback: async (person: Record<string, unknown>) => {
          updateShowData({ secretary: person.id as string });
          // Refresh the people list so the new person appears in the dropdown
          await loadPeople();
          logger.debug('Secretary created and selected', 'wizard', { secretaryId: person.id });
        },
      },
    });
  };

  const handleCreateJudge = () => {
    panelManager.openPanel({
      type: 'judge',
      title: 'Create New Judge',
      subtitle: 'Add a new qualified judge to the system',
      context: {
        entityType: 'judge',
        mode: 'create',
        selectionCallback: async (entity: Record<string, unknown>) => {
          const judge = entity as {
            id: string;
            firstName: string;
            lastName: string;
            email?: string;
            phone?: string;
          };
          const judgeName = `${judge.firstName} ${judge.lastName}`;
          addJudgeToShow(judge.id, {
            name: judgeName,
            email: judge.email || '',
            phone: judge.phone || '',
          });
          await loadPeople();
          logger.debug('Judge created and added to show', 'wizard', { judgeName });
        },
      },
      size: 'lg',
    });
  };

  const handleAddJudge = (person: (typeof people)[number]) => {
    addJudgeToShow(person.id, {
      name: `${person.firstName} ${person.lastName}`,
      email: person.email || '',
      phone: person.phone || '',
    });
    setShowJudgeSearch(false);
    setJudgeSearchTerm('');
  };

  // Validation is handled by the wizard page via getValidationMessagesForStep.
  // No auto-marking needed — markStepCompleted is called by handleNext.

  // Date validation
  const isValidDateRange = () => {
    if (!show.startDate || !show.endDate) return true;
    return !isAfter(new Date(show.startDate), new Date(show.endDate));
  };

  const isValidEntryDates = () => {
    if (!show.entryOpenDate || !show.entryCloseDate) return true;
    return !isAfter(new Date(show.entryOpenDate), new Date(show.entryCloseDate));
  };

  // Smart default: Auto-suggest Entry Close Date (3 days before Start Date)
  useEffect(() => {
    if (show.startDate && !show.entryCloseDate) {
      const suggestedCloseDate = subDays(new Date(show.startDate), 3);
      // Only suggest if it's in the future
      if (suggestedCloseDate > new Date()) {
        updateShowData({ entryCloseDate: suggestedCloseDate.toISOString() });
      }
    }
  }, [show.startDate, show.entryCloseDate, updateShowData]);

  return (
    <div className={className}>
      <div className="space-y-8">
        {/* Basic Show Information */}
        <div className="group relative bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg hover:-translate-y-0.5">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative">
            <h3 className="text-lg font-semibold mb-4 pl-3 border-l-2 border-primary text-primary transition-colors duration-300">
              Basic Show Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Show Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={show.name || ''}
                  onChange={e => updateShowData({ name: e.target.value })}
                  placeholder="Enter show name"
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Show Type <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={show.type || ''}
                  onValueChange={value =>
                    updateShowData({ type: value as 'AKC' | 'UKC' | 'NASDA' | 'Other' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select show type">
                      {show.type ? SHOW_TYPES.find(t => t.value === show.type)?.label : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {SHOW_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  Start Date <span className="text-destructive">*</span>
                </Label>
                <DateTimePicker
                  value={show.startDate ? new Date(show.startDate) : undefined}
                  onChange={date => {
                    if (date) {
                      updateShowData({ startDate: date.toISOString() });
                    }
                  }}
                  placeholder="Select start date"
                  showTime={true}
                />
                {!isValidDateRange() && (
                  <p className="text-sm text-red-500 mt-1">Start date must be before end date</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>
                  End Date <span className="text-destructive">*</span>
                </Label>
                <DateTimePicker
                  value={show.endDate ? new Date(show.endDate) : undefined}
                  onChange={date => {
                    if (date) {
                      updateShowData({ endDate: date.toISOString() });
                    }
                  }}
                  placeholder="Select end date"
                  showTime={true}
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label>
                  Location <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={show.location || ''}
                  onChange={e => updateShowData({ location: e.target.value })}
                  placeholder="Enter venue name and address"
                  rows={3}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Club Information */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg hover:-translate-y-0.5">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative">
            <h3 className="text-lg font-semibold mb-4 pl-3 border-l-2 border-primary text-primary transition-colors duration-300">
              Club Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>
                  Host Club <span className="text-destructive">*</span>
                </Label>
                <div className="space-y-3">
                  <Popover open={showClubSearch} onOpenChange={setShowClubSearch}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        {show.clubId
                          ? clubs.find(c => c.id === show.clubId)?.name || 'Unknown Club'
                          : 'Select a club'}
                        <Search className="ml-auto h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="start">
                      <div className="p-3 border-b">
                        <Input
                          placeholder="Search clubs..."
                          value={clubSearchTerm}
                          onChange={e => setClubSearchTerm(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <div className="max-h-60 overflow-auto">
                        {filteredClubs.map(club => (
                          <div
                            key={club.id}
                            className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                            onClick={() => {
                              updateShowData({ clubId: club.id });
                              setShowClubSearch(false);
                              setClubSearchTerm('');
                            }}
                          >
                            <div className="font-medium">{club.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {club.address.city}, {club.address.state}
                            </div>
                          </div>
                        ))}
                        {filteredClubs.length === 0 && (
                          <div className="p-3 text-sm text-muted-foreground text-center">
                            No clubs found
                          </div>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCreateClub}
                    className="w-full border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 shadow-sm"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create New Club
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Show Officials */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg hover:-translate-y-0.5">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative">
            <h3 className="text-lg font-semibold mb-4 pl-3 border-l-2 border-primary text-primary transition-colors duration-300">
              Show Officials
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Show Chairman <span className="text-destructive">*</span>
                </Label>
                <div className="space-y-3">
                  <Select
                    value={show.chairman || ''}
                    onValueChange={value => updateShowData({ chairman: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select chairman">
                        {getPersonName(show.chairman)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {filteredPeople.map(person => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.firstName} {person.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCreateChairman}
                    className="w-full border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 shadow-sm"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create New Chairman
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>
                  Show Secretary <span className="text-destructive">*</span>
                </Label>
                <div className="space-y-3">
                  <Select
                    value={show.secretary || ''}
                    onValueChange={value => updateShowData({ secretary: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select secretary">
                        {getPersonName(show.secretary)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {filteredPeople.map(person => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.firstName} {person.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCreateSecretary}
                    className="w-full border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 shadow-sm"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create New Secretary
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Show Judges */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg hover:-translate-y-0.5">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative">
            <h3 className="text-lg font-semibold mb-4 pl-3 border-l-2 border-primary text-primary transition-colors duration-300">
              <span className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                Show Judges
              </span>
            </h3>
            <div className="space-y-4">
              {/* Selected Judges */}
              {selectedJudges.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedJudges.map(judge => (
                    <Badge
                      key={judge.id}
                      variant="secondary"
                      className="flex items-center gap-1.5 py-1.5 px-3 text-sm"
                    >
                      <span>{judge.name}</span>
                      {judge.judgeNumber && (
                        <span className="text-muted-foreground">#{judge.judgeNumber}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeJudgeFromShow(judge.id)}
                        className="ml-1 hover:text-destructive transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Judge Search Popover */}
              <Popover open={showJudgeSearch} onOpenChange={setShowJudgeSearch}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    {selectedJudges.length > 0
                      ? `${selectedJudges.length} judge${selectedJudges.length !== 1 ? 's' : ''} selected — add more`
                      : 'Search and add judges'}
                    <Search className="ml-auto h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="p-3 border-b">
                    <Input
                      placeholder="Search by name or judge number..."
                      value={judgeSearchTerm}
                      onChange={e => setJudgeSearchTerm(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <div className="max-h-60 overflow-auto">
                    {availableJudges.map(judge => (
                      <div
                        key={judge.id}
                        className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                        onClick={() => handleAddJudge(judge)}
                      >
                        <div className="font-medium">
                          {judge.firstName} {judge.lastName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {judge.judgeInfo?.judgeNumber
                            ? `#${judge.judgeInfo.judgeNumber}`
                            : 'No judge number'}
                        </div>
                      </div>
                    ))}
                    {availableJudges.length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        {people.some(p => p.roles?.includes('judge'))
                          ? 'No more judges available'
                          : 'No judges found in the system'}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Create New Judge */}
              <Button
                type="button"
                variant="outline"
                onClick={handleCreateJudge}
                className="w-full border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 shadow-sm"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create New Judge
              </Button>

              <p className="text-xs text-muted-foreground">
                Judges added here will be available for class assignment in the next steps.
              </p>
            </div>
          </div>
        </div>

        {/* Entry Information */}
        <div className="group relative bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg hover:-translate-y-0.5">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative">
            <h3 className="text-lg font-semibold mb-4 pl-3 border-l-2 border-primary text-primary transition-colors duration-300">
              Entry Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Entry Opens <span className="text-destructive">*</span>
                </Label>
                <DateTimePicker
                  value={show.entryOpenDate ? new Date(show.entryOpenDate) : undefined}
                  onChange={date => {
                    if (date) {
                      updateShowData({ entryOpenDate: date.toISOString() });
                    }
                  }}
                  placeholder="Select entry open date"
                  showTime={true}
                />
                {!isValidEntryDates() && (
                  <p className="text-sm text-red-500 mt-1">
                    Entry open date must be before close date
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>
                  Entry Closes <span className="text-destructive">*</span>
                </Label>
                <DateTimePicker
                  value={show.entryCloseDate ? new Date(show.entryCloseDate) : undefined}
                  onChange={date => {
                    if (date) {
                      updateShowData({ entryCloseDate: date.toISOString() });
                    }
                  }}
                  placeholder="Select entry close date"
                  showTime={true}
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Pre-Entry Fee ($)
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p>
                          Entry fee for registrations submitted before the entry close date. Usually
                          lower than day-of-show fee.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={show.preEntryFee || ''}
                  onChange={e => updateShowData({ preEntryFee: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Day-of-Show Fee ($)
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p>
                          Entry fee for on-site registrations on the day of the show. Usually higher
                          than pre-entry fee.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={show.dayOfShowFee || ''}
                  onChange={e => updateShowData({ dayOfShowFee: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShowDetailsStep;
