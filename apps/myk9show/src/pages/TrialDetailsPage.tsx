import React, { useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTrialStore } from '@/store/trialStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { hasScopedClubRole } from '@/utils/roleScopes';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useTrialDetailData } from '@/hooks/useTrialDetailData';
import TrialDetailsMain from '@/components/trials/TrialDetailsMain';
import {
  TrialManagementDialogs,
  type TrialManagementDialogsHandle,
} from '@/components/trials/TrialDetail/TrialManagementDialogs';
import { TabsContent } from '@/components/ui/tabs';
import { PromoCodesSection } from '@/components/secretary/PromoCodesSection';
import { FinancialSummary } from '@/components/secretary/FinancialSummary';
import { TrialEntriesTable } from '@/components/trials/TrialDetail/TrialEntriesTable';
import { TrialClass } from '@/components/trials/types/trial.types';
import {
  Calendar,
  LayoutDashboard,
  ClipboardList,
  Tag,
  DollarSign,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import ThreeDotMenu from '@/components/ui/ThreeDotMenu/ThreeDotMenu';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { DetailHero } from '@/components/common/DetailHero';
import { getStatusBadge } from '@/components/common/detailHeroUtils';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { ErrorState } from '@/components/common/ErrorState';
import { DetailPageSkeleton } from '@/components/common/SkeletonLoaders';
import { useUrlTab } from '@/hooks/useUrlTab';

// Extracted hooks
import { useTrialStats, type EntryForStats } from '@/hooks/useTrialStats';
import { useTrialEntries } from '@/hooks/queries/useTrialEntries';

// Public tabs render for every visitor; management tabs are staff-only. The
// split is load-bearing: useUrlTab validates `?tab=` against the *allowed* list,
// so management tabs must be excluded for non-staff or a deep link like
// `?tab=financials` would render the panel even with its trigger hidden.
const PUBLIC_TAB_IDS = ['overview', 'entries'] as const;
const MANAGEMENT_TAB_IDS = ['promo-codes', 'financials'] as const;
const TAB_IDS = [...PUBLIC_TAB_IDS, ...MANAGEMENT_TAB_IDS] as const;

const TrialDetailsPage: React.FC = () => {
  const { trialId, showId } = useParams<{ trialId: string; showId?: string }>();
  const navigate = useNavigate();
  const { trials, selectedTrialId, selectTrial } = useTrialStore();
  const { isSecretary, isAdmin, hasRole, userWithRoles } = useAuthContext();
  const dialogsRef = useRef<TrialManagementDialogsHandle>(null);

  // Current trial + its parent show, with the anon/cold-store by-id fallback the
  // public trial page needs (the staff gate below scopes club_admin to this
  // trial's club). See useTrialDetailData.
  const {
    currentTrial,
    parentShow,
    fallbackTrialResolved,
    fallbackTrialError,
    refetchFallbackTrial,
  } = useTrialDetailData(trialId);

  // Public route — exhibitors are now deep-linked here from styled landings.
  // Only staff may see create/edit/manage affordances; everyone else gets a
  // read-only view. `club_admin` is inherently club-scoped, so a global
  // hasRole() check would let a Club A admin manage Club B's trial — scope it
  // to THIS trial's club. Secretary/admin stay global, matching ShowDetailsPage.
  const canManageTrial =
    isSecretary ||
    isAdmin ||
    (hasRole(UserRole.CLUB_ADMIN) &&
      hasScopedClubRole(userWithRoles, UserRole.CLUB_ADMIN, parentShow?.clubId));

  // Tab state — URL-synced. Pass only the tabs this visitor may see so a
  // hidden management tab in `?tab=` falls back to 'overview' instead of
  // rendering its panel (PromoCodes/Financials) to a non-staff visitor.
  const allowedTabIds = canManageTrial ? TAB_IDS : PUBLIC_TAB_IDS;
  const [activeTab, setActiveTab] = useUrlTab(allowedTabIds, 'overview');

  // Get classes store (page only needs the list for trialWithClasses below; the
  // mutating actions live in TrialManagementDialogs).
  const { classes } = useClassStoreCompat();

  const { data: trialEntries = [] } = useTrialEntries(trialId || '');

  // Set selected trial based on URL parameter
  useEffect(() => {
    if (trialId) selectTrial(trialId);
  }, [trialId, selectTrial]);

  // Sibling trials for prev/next navigation
  const showTrials = currentTrial
    ? trials.filter(trial => trial.showId === currentTrial.showId)
    : [];
  const currentTrialIndex = showTrials.findIndex(t => t.id === selectedTrialId);
  const prevTrialId = currentTrialIndex > 0 ? showTrials[currentTrialIndex - 1]?.id : null;
  const nextTrialId =
    currentTrialIndex < showTrials.length - 1 ? showTrials[currentTrialIndex + 1]?.id : null;

  const handlePrevTrial = () => {
    if (prevTrialId) {
      navigate(showId ? `/shows/${showId}/trials/${prevTrialId}` : `/trials/${prevTrialId}`);
    }
  };

  const handleNextTrial = () => {
    if (nextTrialId) {
      navigate(showId ? `/shows/${showId}/trials/${nextTrialId}` : `/trials/${nextTrialId}`);
    }
  };

  // Single pass over trialEntries: build count map + stats array
  const { entryCountByClass, trialEntriesForStats } = useMemo(() => {
    const countMap = new Map<string, number>();
    const statsArr: EntryForStats[] = [];
    for (const e of trialEntries) {
      countMap.set(e.class_id, (countMap.get(e.class_id) ?? 0) + 1);
      const status = e.entry_status ?? undefined;
      statsArr.push(
        status !== undefined ? { classId: e.class_id, status } : { classId: e.class_id }
      );
    }
    return { entryCountByClass: countMap, trialEntriesForStats: statsArr };
  }, [trialEntries]);

  // Compute trial with classes
  const trialWithClasses = useMemo(() => {
    if (!currentTrial) return undefined;
    const trialClasses = classes.filter(c => c.trialId === currentTrial.id);
    const convertedClasses = trialClasses.map(classData => {
      const startTime =
        classData.startTime ||
        (classData.trialDate ? `${classData.trialDate}T09:00:00` : new Date().toISOString());
      return {
        id: classData.id,
        element: classData.element || 'Unknown',
        level: classData.level || 'Unknown',
        section: classData.section || 'A',
        status:
          classData.status === 'Scheduled'
            ? 'Upcoming'
            : (classData.status as 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled'),
        judgeId: ((classData as unknown as Record<string, unknown>).judgeId as string) || 'TBD',
        judgeName: classData.judge || 'TBD',
        startTime,
        entries: entryCountByClass.get(classData.id) ?? 0,
      };
    });
    return {
      ...currentTrial,
      classes: convertedClasses.length > 0 ? convertedClasses : currentTrial.classes || [],
    };
  }, [currentTrial, classes, entryCountByClass]);

  const trialStatistics = useTrialStats(trialWithClasses, trialEntriesForStats);

  // Tab definitions with icons and counts
  const classCount = trialWithClasses?.classes?.length ?? 0;
  const entryCount = trialStatistics.entries.total;
  const tabDefs: PrimaryTabDef[] = useMemo(() => {
    const tabs: PrimaryTabDef[] = [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'entries', label: 'Entries', icon: ClipboardList, count: entryCount },
    ];
    if (canManageTrial) {
      tabs.push({ id: 'promo-codes', label: 'Promo Codes', icon: Tag });
      tabs.push({ id: 'financials', label: 'Financials', icon: DollarSign });
    }
    return tabs;
  }, [entryCount, canManageTrial]);

  // Breadcrumbs
  const breadcrumbs = useMemo(() => {
    const crumbs = [{ label: 'Shows', href: '/shows' }];
    if (parentShow) {
      crumbs.push({ label: parentShow.name, href: `/shows/${parentShow.id}` });
    }
    const trialLabel = currentTrial?.type || currentTrial?.trialNumber || 'Trial';
    const trialHref = showId ? `/shows/${showId}/trials/${trialId}` : `/trials/${trialId}`;
    crumbs.push({ label: trialLabel, href: trialHref });
    return crumbs;
  }, [parentShow, currentTrial, showId, trialId]);

  const statusBadge = useMemo(() => getStatusBadge(currentTrial?.status), [currentTrial?.status]);

  // Metadata for DetailHero — must be before early returns (rules of hooks)
  const heroMetadata = useMemo(() => {
    const items = [];
    if (currentTrial?.trialDate) {
      items.push({
        label: new Date(currentTrial.trialDate + 'T00:00:00').toLocaleDateString(),
        icon: <Calendar className="h-4 w-4" />,
      });
    }
    if (classCount > 0) {
      items.push({
        label: `${classCount} class${classCount !== 1 ? 'es' : ''}`,
      });
    }
    return items;
  }, [currentTrial?.trialDate, classCount]);

  // Prev/next navigation for hero
  const prevNextNav = (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={!prevTrialId}
        onClick={handlePrevTrial}
        className="h-8 w-8 p-0"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-xs text-muted-foreground px-1">
        {currentTrialIndex + 1}/{showTrials.length}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={!nextTrialId}
        onClick={handleNextTrial}
        className="h-8 w-8 p-0"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  // Load error on the anon fallback — distinct from "not found". The fetch
  // failing (network / RLS / PostgREST) is NOT the same as the trial not
  // existing; surfacing it as not-found would be misleading and offers no
  // retry. Only relevant when the store didn't resolve the trial.
  if (trialId && !currentTrial && fallbackTrialError) {
    return (
      <PageShell>
        <ErrorState
          message="We couldn't load this trial. Please try again."
          onRetry={() => refetchFallbackTrial()}
        />
      </PageShell>
    );
  }

  // Not found state — the store knows about other trials but not this one
  // (warm session), OR the anon by-id fallback SUCCEEDED with an empty result
  // (cold guest on a genuinely missing id). Gate on `isSuccess`, not `isFetched`
  // — the latter is also true after an error, which would mis-render a failed
  // fetch as "doesn't exist" (handled by the error branch above instead).
  if (trialId && !currentTrial && (trials.length > 0 || fallbackTrialResolved)) {
    return (
      <PageShell>
        <ErrorState
          message="The trial you're looking for doesn't exist."
          onRetry={() => navigate(showId ? `/shows/${showId}` : '/shows')}
        />
      </PageShell>
    );
  }

  // Dialog triggers delegate to TrialManagementDialogs (it owns the dialog
  // state + save/delete logic); the page only opens them via the ref.
  const handleEditTrial = () => dialogsRef.current?.openEditTrial();
  const handleDeleteTrial = () => dialogsRef.current?.openDeleteTrial();
  const handleAddClassesFromTemplate = () => dialogsRef.current?.openAddClasses();
  const handleEditClass = (classItem: TrialClass) => dialogsRef.current?.openEditClass(classItem);
  const handleDeleteClass = (classItem: TrialClass) =>
    dialogsRef.current?.openDeleteClass(classItem);

  return (
    <PageShell>
      {trialWithClasses ? (
        <>
          <PageHeader
            breadcrumbs={breadcrumbs}
            title={currentTrial?.type || currentTrial?.trialNumber || 'Trial'}
          />

          <DetailHero
            name={currentTrial?.type || currentTrial?.trialNumber || 'Trial'}
            subtitle={
              currentTrial?.type !== currentTrial?.trialNumber
                ? currentTrial?.trialNumber
                : undefined
            }
            metadata={heroMetadata}
            badges={statusBadge ? [statusBadge] : []}
            secondaryActions={
              <div className="flex items-center gap-2">
                {showTrials.length > 1 && prevNextNav}
                {canManageTrial && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigate(
                          `/shows/${currentTrial?.showId || showId}/entry-management?trial=${trialId}`
                        )
                      }
                    >
                      <ClipboardList className="h-4 w-4 mr-2" />
                      Manage Entries
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleEditTrial}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <ThreeDotMenu
                      items={[
                        {
                          label: 'Delete Trial',
                          icon: <Trash2 className="h-4 w-4" />,
                          onClick: handleDeleteTrial,
                          className: 'text-destructive',
                        },
                      ]}
                    />
                  </>
                )}
              </div>
            }
          />

          <PrimaryTabs tabs={tabDefs} value={activeTab} onValueChange={setActiveTab}>
            <TabsContent value="overview">
              <TrialDetailsMain
                trial={trialWithClasses}
                statistics={trialStatistics}
                canManage={canManageTrial}
                onAddClassesFromTemplate={handleAddClassesFromTemplate}
                onEditClass={handleEditClass}
                onDeleteClass={handleDeleteClass}
              />
            </TabsContent>

            <TabsContent value="entries">
              <TrialEntriesTable trialId={trialWithClasses.id} />
            </TabsContent>

            <TabsContent value="promo-codes">
              <PromoCodesSection trialId={trialWithClasses.id} />
            </TabsContent>

            <TabsContent value="financials">
              <FinancialSummary trialId={trialWithClasses.id} />
            </TabsContent>
          </PrimaryTabs>
        </>
      ) : (
        <div role="status" aria-label="Loading trial details">
          <DetailPageSkeleton />
        </div>
      )}

      {/* Staff-only management dialogs (add classes, edit/delete trial,
          edit/delete class). The page triggers them via dialogsRef. */}
      {canManageTrial && (
        <TrialManagementDialogs
          ref={dialogsRef}
          currentTrial={currentTrial}
          parentShow={parentShow}
          existingClasses={trialWithClasses?.classes || []}
          entryCountByClass={entryCountByClass}
        />
      )}
    </PageShell>
  );
};

export default TrialDetailsPage;
