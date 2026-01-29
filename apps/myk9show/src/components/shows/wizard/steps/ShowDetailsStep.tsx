// CLEAN REBUILT FILE - Jul 7, 2025 15:17 - NEW FILE TO FORCE REFRESH
import React, { useEffect, useState } from 'react';
import { logger } from '@/services/LoggingService';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Button } from '@/components/ui/button';
import { Plus, Search, HelpCircle } from 'lucide-react';
import { isAfter, subDays } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  const { show, updateShowData, markStepCompleted } = useWizardStore();
  const { clubs, loadClubs } = useClubStore();
  const { people, loadPeople } = useUserStore();
  const panelManager = usePanelManager();
  
  // Search states
  const [clubSearchTerm, setClubSearchTerm] = useState('');
  const [showClubSearch, setShowClubSearch] = useState(false);

  // Filter clubs based on search term
  const filteredClubs = React.useMemo(() => {
    if (!clubSearchTerm.trim()) return clubs;
    return clubs.filter(club =>
      club.name.toLowerCase().includes(clubSearchTerm.toLowerCase()) ||
      club.email.toLowerCase().includes(clubSearchTerm.toLowerCase()) ||
      `${club.address.city}, ${club.address.state}`.toLowerCase().includes(clubSearchTerm.toLowerCase())
    );
  }, [clubs, clubSearchTerm]);

  // Filter people for chairman/secretary - only show those with relevant roles
  const filteredPeople = React.useMemo(() => {
    return people.filter(person =>
      person.roles?.includes('chairman') ||
      person.roles?.includes('secretary') ||
      person.roles?.includes('admin') ||
      person.roles?.includes('steward')
    ).sort((a, b) => {
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [people]);

  // Handlers for opening creation panels
  const handleCreateClub = () => {
    panelManager.openPanel({
      type: 'club',
      title: 'Create New Club',
      subtitle: 'Add a new club to host this show',
      context: {
        entityType: 'club',
        mode: 'create',
        selectionCallback: (entity: Record<string, unknown>) => {
          const club = entity as { id: string; name: string };
          updateShowData({ clubId: club.id });
          // Refresh the clubs list to include the new club in dropdown
          loadClubs();
          logger.debug('Club created and selected', 'wizard', { clubName: club.name });
        }
      }
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
          role: 'chairman'
        },
        selectionCallback: (person) => {
          const chairmanName = `${person.firstName} ${person.lastName}`;
          updateShowData({ chairman: chairmanName });
          // Refresh the people list to include the new person in dropdown
          loadPeople();
          logger.debug('Chairman created and selected', 'wizard', { chairmanName });
        }
      }
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
          role: 'secretary'
        },
        selectionCallback: (person) => {
          const secretaryName = `${person.firstName} ${person.lastName}`;
          updateShowData({ secretary: secretaryName });
          // Refresh the people list to include the new person in dropdown
          loadPeople();
          logger.debug('Secretary created and selected', 'wizard', { secretaryName });
        }
      }
    });
  };

  // Auto-complete step when valid
  useEffect(() => {
    const isValid = !!(
      show.name?.trim() &&
      show.type &&
      show.startDate &&
      show.endDate &&
      show.location?.trim() &&
      show.clubId &&
      show.chairman?.trim() &&
      show.secretary?.trim() &&
      show.entryOpenDate &&
      show.entryCloseDate
    );
    
    if (isValid) {
      markStepCompleted(0);
    }
  }, [show, markStepCompleted]);

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
            <h3 className="text-lg font-semibold mb-4 pl-3 border-l-2 border-primary text-primary transition-colors duration-300">Basic Show Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Show Name <span className="text-destructive">*</span></Label>
                <Input
                  value={show.name || ''}
                  onChange={(e) => updateShowData({ name: e.target.value })}
                  placeholder="Enter show name"
                />
              </div>

              <div className="space-y-2">
                <Label>Show Type <span className="text-destructive">*</span></Label>
                <Select
                  value={show.type || ''}
                  onValueChange={(value) => updateShowData({ type: value as 'AKC' | 'UKC' | 'NASDA' | 'Other' })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select show type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SHOW_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Start Date <span className="text-destructive">*</span></Label>
                <DateTimePicker
                  value={show.startDate ? new Date(show.startDate) : undefined}
                  onChange={(date) => {
                    if (date) {
                      updateShowData({ startDate: date.toISOString() });
                    }
                  }}
                  placeholder="Select start date"
                  showTime={false}
                />
                {!isValidDateRange() && (
                  <p className="text-sm text-red-500 mt-1">Start date must be before end date</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>End Date <span className="text-destructive">*</span></Label>
                <DateTimePicker
                  value={show.endDate ? new Date(show.endDate) : undefined}
                  onChange={(date) => {
                    if (date) {
                      updateShowData({ endDate: date.toISOString() });
                    }
                  }}
                  placeholder="Select end date"
                  showTime={false}
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label>Location <span className="text-destructive">*</span></Label>
                <Textarea
                  value={show.location || ''}
                  onChange={(e) => updateShowData({ location: e.target.value })}
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
            <h3 className="text-lg font-semibold mb-4 pl-3 border-l-2 border-primary text-primary transition-colors duration-300">Club Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Host Club <span className="text-destructive">*</span></Label>
                <div className="space-y-3">
                  <Popover open={showClubSearch} onOpenChange={setShowClubSearch}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        {show.clubId ?
                          clubs.find(c => c.id === show.clubId)?.name || 'Unknown Club' :
                          'Select a club'
                        }
                        <Search className="ml-auto h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="start">
                      <div className="p-3 border-b">
                        <Input
                          placeholder="Search clubs..."
                          value={clubSearchTerm}
                          onChange={(e) => setClubSearchTerm(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <div className="max-h-60 overflow-auto">
                        {filteredClubs.map((club) => (
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
            <h3 className="text-lg font-semibold mb-4 pl-3 border-l-2 border-primary text-primary transition-colors duration-300">Show Officials</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Show Chairman <span className="text-destructive">*</span></Label>
                <div className="space-y-3">
                  <Select
                    value={show.chairman || ''}
                    onValueChange={(value) => updateShowData({ chairman: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select chairman" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredPeople.map((person) => (
                        <SelectItem key={person.id} value={`${person.firstName} ${person.lastName}`}>
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
                <Label>Show Secretary <span className="text-destructive">*</span></Label>
                <div className="space-y-3">
                  <Select
                    value={show.secretary || ''}
                    onValueChange={(value) => updateShowData({ secretary: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select secretary" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredPeople.map((person) => (
                        <SelectItem key={person.id} value={`${person.firstName} ${person.lastName}`}>
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

        {/* Entry Information */}
        <div className="group relative bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg hover:-translate-y-0.5">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative">
            <h3 className="text-lg font-semibold mb-4 pl-3 border-l-2 border-primary text-primary transition-colors duration-300">Entry Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Entry Opens <span className="text-destructive">*</span></Label>
                <DateTimePicker
                  value={show.entryOpenDate ? new Date(show.entryOpenDate) : undefined}
                  onChange={(date) => {
                    if (date) {
                      updateShowData({ entryOpenDate: date.toISOString() });
                    }
                  }}
                  placeholder="Select entry open date"
                  showTime={false}
                />
                {!isValidEntryDates() && (
                  <p className="text-sm text-red-500 mt-1">Entry open date must be before close date</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Entry Closes <span className="text-destructive">*</span></Label>
                <DateTimePicker
                  value={show.entryCloseDate ? new Date(show.entryCloseDate) : undefined}
                  onChange={(date) => {
                    if (date) {
                      updateShowData({ entryCloseDate: date.toISOString() });
                    }
                  }}
                  placeholder="Select entry close date"
                  showTime={false}
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
                        <p>Entry fee for registrations submitted before the entry close date. Usually lower than day-of-show fee.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={show.preEntryFee || ''}
                  onChange={(e) => updateShowData({ preEntryFee: parseFloat(e.target.value) || 0 })}
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
                        <p>Entry fee for on-site registrations on the day of the show. Usually higher than pre-entry fee.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={show.dayOfShowFee || ''}
                  onChange={(e) => updateShowData({ dayOfShowFee: parseFloat(e.target.value) || 0 })}
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