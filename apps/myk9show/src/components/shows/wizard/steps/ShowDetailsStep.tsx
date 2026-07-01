import React, { useEffect, useState } from 'react';
import { logger } from '@/services/LoggingService';
import { CloneFromShowCombobox } from './CloneFromShowCombobox';
import { PaymentMethodsCheckboxGroup } from '@/components/common/PaymentMethodsCheckboxGroup';
import { useWizardStore } from '@/store/wizardStore';
import { useClubStore } from '@/store/clubStore';
import { useUserStore } from '@/store/userStore';
import { UserRole } from '@/types/auth-types';
import { useUserClubIds } from '@/hooks/useUserClubIds';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { ShowDetailsStepProps } from './ShowDetailsStep.types';
import {
  filterClubs,
  resolveSelectedJudges,
  isValidDateRange,
  isValidEntryDates,
} from './ShowDetailsStep.helpers';
import { ClubSection, BasicShowInfoSection } from './ShowDetailsStep.sections';
import { OfficialPicker } from './OfficialPicker';
import { JudgesPicker } from './JudgesPicker';
import { useShowDetailsStepActions } from './useShowDetailsStepActions';

export const ShowDetailsStep: React.FC<ShowDetailsStepProps> = ({ className }) => {
  logger.debug('ShowDetailsStep component loaded', 'wizard');
  const { show, updateShowData, addJudgeToShow, removeJudgeFromShow, judgeDetails } =
    useWizardStore();
  const { clubs, loadClubs, syncClubs } = useClubStore();
  const { people, loadPeople, isLoading } = useUserStore();
  const { userWithRoles } = useAuthContext();

  // Only surface a "loading" state on the pickers during the initial fetch —
  // not during unrelated create/update mutations that also flip isLoading.
  const peopleLoading = isLoading && people.length === 0;

  const selectedChairmanId = show.officials.chairman[0];
  const selectedSecretaryId = show.officials.secretary[0];

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
    // Depend on secretary[0] primitive, not show.officials object, to avoid re-triggering
    // on every updateShowData call that produces a new officials reference.
  }, [show.officials.secretary[0], userWithRoles?.databaseUserId, updateShowData]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const {
    handleCreateClub,
    handleCreateOfficialPerson,
    handleSaveJudgeCredentials,
    handleCreateNewJudge,
  } = useShowDetailsStepActions();

  // Entry close date is set manually by the secretary — no auto-populate.

  const dateRangeValid = isValidDateRange(show.startDate, show.endDate);
  const entryDatesValid = isValidEntryDates(show.entryOpenDate, show.entryCloseDate);

  return (
    <div className={className}>
      <div className="space-y-8">
        {/* Clone from previous show — optional, prefills all fields */}
        <CloneFromShowCombobox clubId={show.clubId || undefined} />

        {/* Basic Show Information */}
        <BasicShowInfoSection
          show={show}
          dateRangeValid={dateRangeValid}
          entryDatesValid={entryDatesValid}
          onUpdate={updateShowData}
        />

        {/* Payment Methods */}
        <div>
          <div>
            <h3 className="text-lg font-semibold mb-4 text-foreground">Payment Methods</h3>
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
        <div>
          <div>
            <h3 className="text-lg font-semibold mb-4 text-foreground">Show Officials</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <OfficialPicker
                label="Show Chairman"
                required
                selectedPersonId={selectedChairmanId}
                people={people}
                suggestedRoles={[UserRole.CHAIRMAN, UserRole.CLUB_ADMIN]}
                loading={peopleLoading}
                excludePersonIds={selectedSecretaryId ? [selectedSecretaryId] : []}
                onSelect={id =>
                  updateShowData({ officials: { ...show.officials, chairman: [id] } })
                }
                onCreatePerson={handleCreateOfficialPerson}
              />
              <OfficialPicker
                label="Show Secretary"
                required
                selectedPersonId={selectedSecretaryId}
                people={people}
                suggestedRoles={[UserRole.SECRETARY]}
                loading={peopleLoading}
                excludePersonIds={selectedChairmanId ? [selectedChairmanId] : []}
                {...(selectedSecretaryId === userWithRoles?.databaseUserId
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
        <div>
          <div>
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

export default ShowDetailsStep;
