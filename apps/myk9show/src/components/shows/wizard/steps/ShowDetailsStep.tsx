import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { CloneFromShowCombobox } from './CloneFromShowCombobox';
import { CloneStatusBanner } from './CloneStatusBanner';
import { useWizardStore } from '@/store/wizardStore';
import { useClubStore } from '@/store/clubStore';
import { useUserStore } from '@/store/userStore';
import { useUserClubIds } from '@/hooks/useUserClubIds';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { ShowDetailsStepProps } from './ShowDetailsStep.types';
import {
  filterClubs,
  resolveSelectedJudges,
  isValidDateRange,
  isValidEntryDates,
  canChangeShowOrganization,
} from './ShowDetailsStep.helpers';
import {
  BasicsSection,
  DatesEntrySection,
  FeesPaymentsSection,
  MoreOptionsSection,
  OfficialsSection,
  HostClubField,
} from './sections';
import { useShowDetailsStepActions } from './useShowDetailsStepActions';

export const ShowDetailsStep: React.FC<ShowDetailsStepProps> = ({
  className,
  mode = 'create',
  persistedOrganization,
}) => {
  logger.debug('ShowDetailsStep component loaded', 'wizard');
  const location = useLocation();
  const {
    show,
    trials,
    cloneHydration,
    updateShowData,
    addJudgeToShow,
    removeJudgeFromShow,
    judgeDetails,
  } = useWizardStore();
  const { clubs, loadClubs, syncClubs } = useClubStore();
  const { people, loadPeople, loadUsers, isLoading } = useUserStore();
  const { userWithRoles } = useAuthContext();
  const cloneHydrating = cloneHydration.status === 'hydrating';

  const organizationEditable = canChangeShowOrganization({
    mode,
    selectedClassCount: trials.reduce((count, trial) => count + trial.classes.length, 0),
  });
  const isExistingShow = mode === 'add-trials' || mode === 'add-classes';
  const organizationHint = isExistingShow
    ? 'This is an existing show. Its sanctioning organization cannot change in this wizard; create a separate show instead.'
    : !organizationEditable
      ? 'To change the organization, clear all selected classes first.'
      : undefined;

  const handleUpdateShow = (patch: Parameters<typeof updateShowData>[0]) => {
    if ('organization' in patch && !organizationEditable) return;
    updateShowData(patch);
  };

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
    if (cloneHydrating) return;
    if (!show.officials.secretary[0] && userWithRoles?.databaseUserId) {
      updateShowData({
        officials: { ...show.officials, secretary: [userWithRoles.databaseUserId] },
      });
    }
  }, [cloneHydrating, show.officials, userWithRoles?.databaseUserId, updateShowData]);

  // Search states
  const [clubSearchTerm, setClubSearchTerm] = useState('');
  const [showClubSearch, setShowClubSearch] = useState(false);

  // Auto-select club if user has exactly one
  useEffect(() => {
    if (cloneHydrating) return;
    if (!show.clubId && scopedClubs.length === 1) {
      updateShowData({ clubId: scopedClubs[0].id });
    }
  }, [cloneHydrating, show.clubId, scopedClubs, updateShowData]);

  // Derived data
  const filteredClubsList = React.useMemo(
    () => filterClubs(scopedClubs, clubSearchTerm),
    [scopedClubs, clubSearchTerm]
  );

  const selectedJudges = React.useMemo(
    () => resolveSelectedJudges(show.judgeIds, people, judgeDetails),
    [show.judgeIds, people, judgeDetails]
  );

  const { handleCreateOfficialPerson, handleSaveJudgeCredentials, handleCreateNewJudge } =
    useShowDetailsStepActions();

  const createClubHref = React.useMemo(() => {
    const returnTo = `${location.pathname}${location.search}`;
    return `/clubs?${new URLSearchParams({ create: 'true', returnTo }).toString()}`;
  }, [location.pathname, location.search]);

  // Entry close date is set manually by the secretary — no auto-populate.

  const dateRangeValid = isValidDateRange(show.startDate, show.endDate);
  const entryDatesValid = isValidEntryDates(show.entryOpenDate, show.entryCloseDate);

  const handleAddJudge = (personId: string) => {
    const p = people.find(x => x.id === personId);
    if (!p) return;
    addJudgeToShow(p.id, {
      name: `${p.firstName} ${p.lastName}`,
      email: p.email ?? '',
      phone: '',
    });
  };

  return (
    <div className={className}>
      <div className="space-y-8">
        {/* Clone from previous show — optional, prefills every group below. Create-only: a
            clone replaces the organization, which an existing show cannot change. */}
        {!isExistingShow && (
          <>
            <CloneFromShowCombobox clubId={show.clubId || undefined} />
            {/* Sibling, not child: the clone's status and recovery never depend on the
                picker's show-list query. */}
            <CloneStatusBanner />
          </>
        )}

        <div
          data-testid="clone-locked-show-details"
          inert={cloneHydrating}
          aria-busy={cloneHydrating}
        >
          <BasicsSection
            show={show}
            onUpdate={handleUpdateShow}
            organizationDisabled={!organizationEditable}
            organizationValue={isExistingShow ? persistedOrganization : undefined}
            organizationHint={organizationHint}
            clubField={
              <HostClubField
                clubId={show.clubId}
                clubs={clubs}
                filteredClubs={filteredClubsList}
                showSearch={showClubSearch}
                setShowSearch={setShowClubSearch}
                searchTerm={clubSearchTerm}
                setSearchTerm={setClubSearchTerm}
                onSelectClub={clubId => updateShowData({ clubId })}
                createClubHref={createClubHref}
              />
            }
          />

          <DatesEntrySection
            show={show}
            dateRangeValid={dateRangeValid}
            entryDatesValid={entryDatesValid}
            onUpdate={updateShowData}
          />

          <FeesPaymentsSection show={show} onUpdate={updateShowData} />

          <MoreOptionsSection show={show} onUpdate={updateShowData} />

          <OfficialsSection
            people={people}
            peopleLoading={peopleLoading}
            selectedChairmanId={selectedChairmanId}
            selectedSecretaryId={selectedSecretaryId}
            secretaryIsSelf={selectedSecretaryId === userWithRoles?.databaseUserId}
            selectedJudges={selectedJudges}
            onOpenOfficialPicker={() => void loadUsers()}
            onSelectChairman={id =>
              updateShowData({ officials: { ...show.officials, chairman: [id] } })
            }
            onSelectSecretary={id =>
              updateShowData({ officials: { ...show.officials, secretary: [id] } })
            }
            onCreatePerson={handleCreateOfficialPerson}
            onAddJudge={handleAddJudge}
            onRemoveJudge={removeJudgeFromShow}
            onSaveCredentials={handleSaveJudgeCredentials}
            onCreateJudge={handleCreateNewJudge}
          />
        </div>
      </div>
    </div>
  );
};

export default ShowDetailsStep;
