import React, { useEffect, useState } from 'react';
import { logger } from '@/services/LoggingService';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { HelpCircle } from 'lucide-react';
import { subDays } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { useWizardStore } from '@/store/wizardStore';
import { useClubStore } from '@/store/clubStore';
import { useUserStore } from '@/store/userStore';
import { usePanelManager } from '@/components/panels/hooks';
import type { ShowDetailsStepProps } from './ShowDetailsStep.types';
import { ORGANIZATIONS } from './ShowDetailsStep.types';
import {
  filterClubs,
  getOfficialsPeople,
  filterPeopleByName,
  getAvailableJudges,
  getPersonName,
  resolveSelectedJudges,
  isValidDateRange,
  isValidEntryDates,
} from './ShowDetailsStep.helpers';
import { ClubSection, OfficialsSection, JudgesSection } from './ShowDetailsStep.sections';

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
  const [chairmanSearchTerm, setChairmanSearchTerm] = useState('');
  const [showChairmanSearch, setShowChairmanSearch] = useState(false);
  const [secretarySearchTerm, setSecretarySearchTerm] = useState('');
  const [showSecretarySearch, setShowSecretarySearch] = useState(false);
  const [judgeSearchTerm, setJudgeSearchTerm] = useState('');
  const [showJudgeSearch, setShowJudgeSearch] = useState(false);

  // Derived data
  const filteredClubsList = React.useMemo(
    () => filterClubs(clubs, clubSearchTerm),
    [clubs, clubSearchTerm]
  );
  const officialsPeople = React.useMemo(() => getOfficialsPeople(people), [people]);
  const filteredChairmen = React.useMemo(
    () => filterPeopleByName(officialsPeople, chairmanSearchTerm),
    [officialsPeople, chairmanSearchTerm]
  );
  const filteredSecretaries = React.useMemo(
    () => filterPeopleByName(officialsPeople, secretarySearchTerm),
    [officialsPeople, secretarySearchTerm]
  );
  const availableJudges = React.useMemo(
    () => getAvailableJudges(people, show.judgeIds, judgeSearchTerm),
    [people, show.judgeIds, judgeSearchTerm]
  );
  const selectedJudges = React.useMemo(
    () => resolveSelectedJudges(show.judgeIds, people, judgeDetails),
    [show.judgeIds, people, judgeDetails]
  );

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
        preFilledData: { role: 'chairman', roleLabel: 'Chairman' },
        selectionCallback: async (person: Record<string, unknown>) => {
          updateShowData({ chairman: person.id as string });
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
        preFilledData: { role: 'secretary', roleLabel: 'Secretary' },
        selectionCallback: async (person: Record<string, unknown>) => {
          updateShowData({ secretary: person.id as string });
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

  // Smart default: Auto-suggest Entry Close Date (3 days before Start Date)
  useEffect(() => {
    if (show.startDate && !show.entryCloseDate) {
      const suggestedCloseDate = subDays(new Date(show.startDate), 3);
      if (suggestedCloseDate > new Date()) {
        updateShowData({ entryCloseDate: suggestedCloseDate.toISOString() });
      }
    }
  }, [show.startDate, show.entryCloseDate, updateShowData]);

  const dateRangeValid = isValidDateRange(show.startDate, show.endDate);
  const entryDatesValid = isValidEntryDates(show.entryOpenDate, show.entryCloseDate);

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
                  className="border border-border bg-secondary rounded-md"
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Organization <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={show.organization || ''}
                  onValueChange={value =>
                    updateShowData({ organization: value as 'AKC' | 'UKC' | 'NASDA' | 'Other' })
                  }
                >
                  <SelectTrigger className="!bg-secondary h-10">
                    <SelectValue placeholder="Select organization">
                      {show.organization
                        ? ORGANIZATIONS.find(t => t.value === show.organization)?.label
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ORGANIZATIONS.map(org => (
                      <SelectItem key={org.value} value={org.value}>
                        {org.label}
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
                    if (date) updateShowData({ startDate: date.toISOString() });
                  }}
                  placeholder="Select start date"
                  showTime={true}
                />
                {!dateRangeValid && (
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
                    if (date) updateShowData({ endDate: date.toISOString() });
                  }}
                  placeholder="Select end date"
                  showTime={true}
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Entry Opens <span className="text-destructive">*</span>
                </Label>
                <DateTimePicker
                  value={show.entryOpenDate ? new Date(show.entryOpenDate) : undefined}
                  onChange={date => {
                    if (date) updateShowData({ entryOpenDate: date.toISOString() });
                  }}
                  placeholder="Select entry open date"
                  showTime={true}
                />
                {!entryDatesValid && (
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
                    if (date) updateShowData({ entryCloseDate: date.toISOString() });
                  }}
                  placeholder="Select entry close date"
                  showTime={true}
                />
              </div>

              <FeeField
                label="Pre-Entry Fee"
                tooltip="Entry fee for registrations submitted before the entry close date. Usually lower than day-of-show fee."
                value={show.preEntryFee}
                onChange={v => {
                  if (v !== undefined) updateShowData({ preEntryFee: v });
                }}
              />

              <FeeField
                label="Day-of-Show Fee"
                tooltip="Entry fee for on-site registrations on the day of the show. Usually higher than pre-entry fee."
                value={show.dayOfShowFee}
                onChange={v => {
                  if (v !== undefined) updateShowData({ dayOfShowFee: v });
                }}
              />

              <div className="space-y-2 col-span-2">
                <Label>
                  Location <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={show.location || ''}
                  onChange={e => updateShowData({ location: e.target.value })}
                  placeholder="Enter venue name and address"
                  rows={3}
                  className="border border-border bg-secondary rounded-md"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Club Information */}
        <ClubSection
          clubId={show.clubId}
          clubs={clubs}
          filteredClubs={filteredClubsList}
          showSearch={showClubSearch}
          setShowSearch={setShowClubSearch}
          searchTerm={clubSearchTerm}
          setSearchTerm={setClubSearchTerm}
          onSelectClub={clubId => updateShowData({ clubId })}
          onCreateClub={handleCreateClub}
        />

        {/* Show Officials */}
        <OfficialsSection
          chairmanName={getPersonName(people, show.chairman)}
          secretaryName={getPersonName(people, show.secretary)}
          filteredChairmen={filteredChairmen}
          filteredSecretaries={filteredSecretaries}
          showChairmanSearch={showChairmanSearch}
          setShowChairmanSearch={setShowChairmanSearch}
          chairmanSearchTerm={chairmanSearchTerm}
          setChairmanSearchTerm={setChairmanSearchTerm}
          showSecretarySearch={showSecretarySearch}
          setShowSecretarySearch={setShowSecretarySearch}
          secretarySearchTerm={secretarySearchTerm}
          setSecretarySearchTerm={setSecretarySearchTerm}
          onSelectChairman={id => updateShowData({ chairman: id })}
          onSelectSecretary={id => updateShowData({ secretary: id })}
          onCreateChairman={handleCreateChairman}
          onCreateSecretary={handleCreateSecretary}
        />

        {/* Show Judges */}
        <JudgesSection
          selectedJudges={selectedJudges}
          availableJudges={availableJudges}
          showSearch={showJudgeSearch}
          setShowSearch={setShowJudgeSearch}
          searchTerm={judgeSearchTerm}
          setSearchTerm={setJudgeSearchTerm}
          hasAnyJudges={people.some(p => p.roles?.includes('judge'))}
          onAddJudge={handleAddJudge}
          onRemoveJudge={removeJudgeFromShow}
          onCreateJudge={handleCreateJudge}
        />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  FeeField — small local helper (not worth a separate file)          */
/* ------------------------------------------------------------------ */

interface FeeFieldProps {
  label: string;
  tooltip: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

const FeeField: React.FC<FeeFieldProps> = ({ label, tooltip, value, onChange }) => (
  <div className="space-y-2">
    <Label className="flex items-center gap-1.5">
      {label}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </Label>
    <CurrencyInput
      value={value}
      onChange={onChange}
      placeholder="0.00"
      className="border border-border bg-secondary rounded-md"
    />
  </div>
);

export default ShowDetailsStep;
