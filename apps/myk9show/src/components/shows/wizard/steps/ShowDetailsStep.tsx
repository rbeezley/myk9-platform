import React, { useEffect, useState } from 'react';
import { logger } from '@/services/LoggingService';
import { CloneFromShowCombobox } from './CloneFromShowCombobox';
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
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { PaymentMethodsCheckboxGroup } from '@/components/common/PaymentMethodsCheckboxGroup';
import { useWizardStore } from '@/store/wizardStore';
import { useClubStore } from '@/store/clubStore';
import { useUserStore } from '@/store/userStore';
import { usePanelManager } from '@/components/panels/hooks';
import { UserRole } from '@/types/auth-types';
import { useUserClubIds } from '@/hooks/useUserClubIds';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { ShowDetailsStepProps } from './ShowDetailsStep.types';
import { ORGANIZATIONS } from './ShowDetailsStep.types';
import {
  filterClubs,
  resolveSelectedJudges,
  isValidDateRange,
  isValidEntryDates,
} from './ShowDetailsStep.helpers';
import { ClubSection } from './ShowDetailsStep.sections';
import { OfficialPicker } from './OfficialPicker';
import { JudgesPicker } from './JudgesPicker';
import { createUser, updateUser } from '@/services/database/queries/userQueries';
import { judgeQualificationQueries } from '@/services/database/queries/judgeQueries';

export const ShowDetailsStep: React.FC<ShowDetailsStepProps> = ({ className }) => {
  logger.debug('ShowDetailsStep component loaded', 'wizard');
  const { show, updateShowData, addJudgeToShow, removeJudgeFromShow, judgeDetails } =
    useWizardStore();
  const { clubs, loadClubs, syncClubs } = useClubStore();
  const { people, loadPeople } = useUserStore();
  const panelManager = usePanelManager();
  const { userWithRoles } = useAuthContext();

  // Scope clubs to user's assigned clubs (secretaries/club admins see only their clubs)
  const userClubIds = useUserClubIds();

  const scopedClubs = React.useMemo(
    () => (userClubIds ? clubs.filter(c => userClubIds.has(c.id)) : clubs),
    [clubs, userClubIds]
  );

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

  // Load people on mount so pickers have data regardless of navigation path
  useEffect(() => {
    if (people.length === 0) {
      loadPeople();
    }
  }, [people.length, loadPeople]);

  // Auto-fill secretary with the logged-in user (overridable)
  useEffect(() => {
    if (!show.officials.secretary[0] && userWithRoles?.databaseUserId) {
      updateShowData({
        officials: { ...show.officials, secretary: [userWithRoles.databaseUserId] },
      });
    }
  }, [userWithRoles?.databaseUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search states
  const [clubSearchTerm, setClubSearchTerm] = useState('');
  const [showClubSearch, setShowClubSearch] = useState(false);

  // Auto-select club if user has exactly one
  useEffect(() => {
    if (!show.clubId && scopedClubs.length === 1) {
      updateShowData({ clubId: scopedClubs[0].id });
    }
  }, [show.clubId, scopedClubs, updateShowData]);

  // Derived data
  const filteredClubsList = React.useMemo(
    () => filterClubs(scopedClubs, clubSearchTerm),
    [scopedClubs, clubSearchTerm]
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

  const handleCreateOfficialPerson = async (data: {
    firstName: string;
    lastName: string;
    email: string;
  }): Promise<string> => {
    const result = await createUser({
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
    });
    if (result.error) throw result.error;
    await loadPeople();
    return result.data!.id;
  };

  const handleSaveJudgeCredentials = async (
    personId: string,
    data: { organization: string; judgeNumber: string; email: string }
  ): Promise<void> => {
    await judgeQualificationQueries.create({
      person_id: personId,
      organization: data.organization,
      qualification_level: 'General',
      disciplines: [],
      judge_number: data.judgeNumber,
      date_obtained: new Date().toISOString().split('T')[0],
      is_active: true,
    });
    const person = people.find(p => p.id === personId);
    if (data.email && !person?.email) {
      await updateUser(personId, { email: data.email });
    }
    await loadPeople();
  };

  const handleCreateNewJudge = async (data: {
    firstName: string;
    lastName: string;
    organization: string;
    judgeNumber: string;
    email: string;
  }): Promise<string> => {
    const result = await createUser({
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
    });
    if (result.error) throw result.error;
    const personId = result.data!.id;
    await judgeQualificationQueries.create({
      person_id: personId,
      organization: data.organization,
      qualification_level: 'General',
      disciplines: [],
      judge_number: data.judgeNumber,
      date_obtained: new Date().toISOString().split('T')[0],
      is_active: true,
    });
    await loadPeople();
    return personId;
  };

  // Entry close date is set manually by the secretary — no auto-populate.

  const dateRangeValid = isValidDateRange(show.startDate, show.endDate);
  const entryDatesValid = isValidEntryDates(show.entryOpenDate, show.entryCloseDate);

  return (
    <div className={className}>
      <div className="space-y-8">
        {/* Clone from previous show — optional, prefills all fields */}
        <CloneFromShowCombobox clubId={show.clubId || undefined} />

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

              <div className="space-y-2 col-span-2">
                <Label>
                  Show Dates <span className="text-destructive">*</span>
                </Label>
                <DateRangePicker
                  startDate={show.startDate ? new Date(show.startDate) : undefined}
                  endDate={show.endDate ? new Date(show.endDate) : undefined}
                  onStartDateChange={date =>
                    updateShowData({ startDate: date?.toISOString() || '' })
                  }
                  onEndDateChange={date => updateShowData({ endDate: date?.toISOString() || '' })}
                  startLabel="Start"
                  endLabel="End"
                  placeholder="Select show start and end dates"
                  startDefaultTime="8:00 AM"
                  endDefaultTime="5:00 PM"
                />
                {!dateRangeValid && (
                  <p className="text-sm text-red-500 mt-1">Start date must be before end date</p>
                )}
              </div>

              <div className="space-y-2 col-span-2">
                <Label>
                  Entry Period <span className="text-destructive">*</span>
                </Label>
                <DateRangePicker
                  startDate={show.entryOpenDate ? new Date(show.entryOpenDate) : undefined}
                  endDate={show.entryCloseDate ? new Date(show.entryCloseDate) : undefined}
                  onStartDateChange={date =>
                    updateShowData({ entryOpenDate: date?.toISOString() || '' })
                  }
                  onEndDateChange={date =>
                    updateShowData({ entryCloseDate: date?.toISOString() || '' })
                  }
                  startLabel="Opens"
                  endLabel="Closes"
                  placeholder="Select entry open and close dates"
                  startDefaultTime="8:00 AM"
                  endDefaultTime="11:59 PM"
                />
                {!entryDatesValid && (
                  <p className="text-sm text-red-500 mt-1">
                    Entry open date must be before close date
                  </p>
                )}
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

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Starting Armband Number
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p>
                          First dog registered will receive this armband number. Subsequent dogs get
                          sequential numbers.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={show.startingArmbandNumber ?? 100}
                  onChange={e =>
                    updateShowData({
                      startingArmbandNumber: parseInt(e.target.value, 10) || 100,
                    })
                  }
                  className="border border-border bg-secondary rounded-md"
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
                  className="border border-border bg-secondary rounded-md"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="group relative bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg hover:-translate-y-0.5">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative">
            <h3 className="text-lg font-semibold mb-4 pl-3 border-l-2 border-primary text-primary transition-colors duration-300">
              Payment Methods
            </h3>
            <PaymentMethodsCheckboxGroup
              acceptCheck={show.acceptCheckPayments ?? false}
              acceptCash={show.acceptCashPayments ?? false}
              onCheckChange={checked => updateShowData({ acceptCheckPayments: checked })}
              onCashChange={checked => updateShowData({ acceptCashPayments: checked })}
            />
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
        <div className="group relative bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg hover:-translate-y-0.5">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative">
            <h3 className="text-lg font-semibold mb-4 pl-3 border-l-2 border-primary text-primary transition-colors duration-300">
              Show Officials
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <OfficialPicker
                label="Show Chairman"
                required
                selectedPersonId={show.officials.chairman[0]}
                people={people}
                suggestedRoles={[UserRole.CHAIRMAN, UserRole.CLUB_ADMIN]}
                onSelect={id =>
                  updateShowData({ officials: { ...show.officials, chairman: [id] } })
                }
                onCreatePerson={handleCreateOfficialPerson}
              />
              <OfficialPicker
                label="Show Secretary"
                required
                selectedPersonId={show.officials.secretary[0]}
                people={people}
                suggestedRoles={[UserRole.SECRETARY]}
                {...(show.officials.secretary[0] === userWithRoles?.databaseUserId
                  ? { autoFillBadge: 'You' }
                  : {})}
                onSelect={id =>
                  updateShowData({ officials: { ...show.officials, secretary: [id] } })
                }
                onCreatePerson={handleCreateOfficialPerson}
              />
            </div>
          </div>
        </div>

        {/* Show Judges */}
        <div className="group relative bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg hover:-translate-y-0.5">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative">
            <JudgesPicker
              selectedJudges={selectedJudges}
              people={people}
              onAddJudge={personId => {
                const p = people.find(x => x.id === personId);
                if (!p) return;
                addJudgeToShow(p.id, {
                  name: `${p.firstName} ${p.lastName}`,
                  email: p.email ?? '',
                  phone: '',
                });
              }}
              onRemoveJudge={removeJudgeFromShow}
              onSaveCredentials={handleSaveJudgeCredentials}
              onCreateJudge={handleCreateNewJudge}
            />
            <p className="text-xs text-muted-foreground mt-3">
              Judges added here will be available for class assignment in the next steps.
            </p>
          </div>
        </div>
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
