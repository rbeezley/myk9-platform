import React, { useEffect, useMemo } from 'react';
import { Navigate, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTrialStore } from '@/store/trialStore';
import { toTrialDetailClass } from './trialDetailClassProjection';
import { useAuthContext } from '@/hooks/useAuthContext';
import { canManageShowSurface } from '@/utils/roleScopes';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useTrialDetailData } from '@/hooks/useTrialDetailData';
import TrialDetailsMain from '@/components/trials/TrialDetailsMain';
import { TabsContent } from '@/components/ui/tabs';
import { TrialEntriesTable } from '@/components/trials/TrialDetail/TrialEntriesTable';
import { Calendar, LayoutDashboard, ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getShowHomeTrialHref } from '@/features/show-map/cockpit/cockpitRoutes';
import { UserRole } from '@/types/auth-types';
import { getEntryManagementHref } from '@/features/entry-operations/entryAttentionRoutes';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { DetailHero } from '@/components/common/DetailHero';
import { heroParentLink, heroViewerFromUser } from '@/components/common/heroParentLink';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { ErrorState } from '@/components/common/ErrorState';
import { NotFoundState } from '@/components/common/NotFoundState';
import { DetailPageSkeleton } from '@/components/common/SkeletonLoaders';
import { useUrlTab } from '@/hooks/useUrlTab';

// Extracted hooks
import { useTrialStats, type EntryForStats } from '@/hooks/useTrialStats';
import { useTrialEntries } from '@/hooks/queries/useTrialEntries';
import { deriveTrialCompositeStatus, deriveTrialStatusKey, formatTrialLabel } from '@myk9/core';
import { StatusIcon, getStatusDescriptor } from '@/components/status';

// useUrlTab validates `?tab=` against this list, so a retired tab (the old
// `?tab=financials` deep link) falls back to Overview instead of rendering nothing.
const TAB_IDS = ['overview', 'entries'] as const;

// Class edit/delete live in the workbench; this view is only ever read-only (canManage is false).
const NO_CLASS_ACTION = () => undefined;

/**
 * Hero title and subtitle for a trial: the shared trial label, with the trial number added as a
 * subtitle only when it says something the title does not.
 */
function trialHeroText(
  name: string | null | undefined,
  trialNumber: string | number | null | undefined
) {
  const title = formatTrialLabel({ name, trialNumber });
  const number =
    trialNumber === null || trialNumber === undefined ? '' : String(trialNumber).trim();
  return { title, subtitle: number !== '' && number !== title.trim() ? number : undefined };
}

const TrialDetailsPage: React.FC = () => {
  const { trialId, showId } = useParams<{ trialId: string; showId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { trials, selectedTrialId, selectTrial } = useTrialStore();
  const { user, isSecretary, isAdmin, hasRole, userWithRoles } = useAuthContext();

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

  // The page is the public read-only view. A manager is sent into the workbench (MYK9-1320):
  // classes and entries have homes there, and the trial's money is on Reports. The club
  // scoping (and why a global hasRole() is wrong for club_admin) lives in canManageShowSurface,
  // shared with Class Details.
  const canManageTrial = canManageShowSurface({
    isSecretary,
    isAdmin,
    hasRole,
    userWithRoles,
    clubId: parentShow?.clubId,
  });
  // A staff-role holder whose show has not resolved yet reads as a non-manager (the club is
  // unknown), so hold the skeleton instead of flashing the public view before the redirect.
  const manageScopeResolving =
    !canManageTrial &&
    !parentShow &&
    !!currentTrial &&
    (isSecretary || isAdmin || hasRole(UserRole.CLUB_ADMIN));

  const [activeTab, setActiveTab] = useUrlTab(TAB_IDS, 'overview');

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
    const convertedClasses = trialClasses.map(classData =>
      toTrialDetailClass(classData, entryCountByClass.get(classData.id) ?? 0)
    );
    return {
      ...currentTrial,
      classes: convertedClasses.length > 0 ? convertedClasses : currentTrial.classes || [],
    };
  }, [currentTrial, classes, entryCountByClass]);

  const trialStatistics = useTrialStats(trialWithClasses, trialEntriesForStats);

  // Tab definitions with icons and counts
  const classCount = trialWithClasses?.classes?.length ?? 0;
  const trialClassSummary = useMemo(
    () =>
      deriveTrialCompositeStatus(
        (trialWithClasses?.classes ?? []).map(cls => ({
          status: cls.status,
          entry_count: cls.entries,
          scored_count: 'completedEntries' in cls ? (cls.completedEntries ?? 0) : 0,
          ...('isScoringFinalized' in cls && cls.isScoringFinalized !== undefined
            ? { is_scoring_finalized: cls.isScoringFinalized }
            : {}),
        }))
      ),
    [trialWithClasses?.classes]
  );
  const entryCount = trialStatistics.entries.total;
  const tabDefs: PrimaryTabDef[] = useMemo(() => {
    return [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'entries', label: 'Entries', icon: ClipboardList, count: entryCount },
    ];
  }, [entryCount]);

  // Breadcrumbs
  const breadcrumbs = useMemo(() => {
    const crumbs = [{ label: 'Shows', href: '/shows' }];
    if (parentShow) {
      crumbs.push({ label: parentShow.name, href: `/shows/${parentShow.id}` });
    }
    const trialLabel = formatTrialLabel({
      name: currentTrial?.name,
      trialNumber: currentTrial?.trialNumber,
    });
    const trialHref = showId ? `/shows/${showId}/trials/${trialId}` : `/trials/${trialId}`;
    crumbs.push({ label: trialLabel, href: trialHref });
    return crumbs;
  }, [parentShow, currentTrial, showId, trialId]);

  const statusBadge = useMemo(() => {
    const status = deriveTrialStatusKey({
      trialStatus: currentTrial?.status,
      classCount,
      completedCount: trialClassSummary.completedCount,
      hasStarted: trialClassSummary.kind === 'in-progress',
    });
    return {
      label: getStatusDescriptor('trial', status).label,
      variant: 'default' as const,
      icon: <StatusIcon family="trial" status={status} size="sm" decorative />,
    };
  }, [classCount, currentTrial?.status, trialClassSummary]);

  const trialHero = useMemo(
    () => trialHeroText(currentTrial?.name, currentTrial?.trialNumber),
    [currentTrial?.name, currentTrial?.trialNumber]
  );

  // Metadata for DetailHero — must be before early returns (rules of hooks)
  const trialDate = currentTrial?.trialDate;
  const heroMetadata = useMemo(() => {
    const items = [];
    if (trialDate) {
      items.push({
        label: new Date(trialDate + 'T00:00:00').toLocaleDateString(),
        icon: <Calendar className="h-4 w-4" />,
      });
    }
    if (classCount > 0) {
      items.push({
        label: `${classCount} class${classCount !== 1 ? 'es' : ''}`,
      });
    }
    return items;
  }, [trialDate, classCount]);

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
          headingLevel={1}
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
        <NotFoundState
          entityName="Trial"
          backTo={showId ? `/shows/${showId}` : '/shows'}
          backLabel={showId ? 'Back to Show' : 'Back to Shows'}
        />
      </PageShell>
    );
  }

  // Manager: the workbench is the one home for this trial's classes and entries.
  if (canManageTrial && currentTrial) {
    const workbenchShowId = currentTrial.showId || showId || '';
    // The Entries tab's deep link lands on Entry Forms filtered to this trial; anything else
    // (Overview, the retired ?tab=financials) lands on the Overview with the trial open.
    const target =
      searchParams.get('tab') === 'entries'
        ? getEntryManagementHref({ showId: workbenchShowId, trialId: currentTrial.id })
        : getShowHomeTrialHref(workbenchShowId, {
            id: currentTrial.id,
            date: currentTrial.trialDate,
          });
    return <Navigate replace to={target} />;
  }

  return (
    <>
      <PageShell>
        {trialWithClasses && !manageScopeResolving ? (
          <>
            <PageHeader breadcrumbs={breadcrumbs} title={trialHero.title} omitTitle />

            <DetailHero
              name={trialHero.title}
              headingLevel={1}
              parent={
                parentShow
                  ? heroParentLink({
                      target: 'show',
                      id: parentShow.id,
                      label: parentShow.name,
                      viewer: heroViewerFromUser(user),
                    })
                  : undefined
              }
              subtitle={trialHero.subtitle}
              metadata={heroMetadata}
              badges={statusBadge ? [statusBadge] : []}
              secondaryActions={
                <div className="flex items-center gap-2">
                  {showTrials.length > 1 && prevNextNav}
                </div>
              }
            />

            <PrimaryTabs tabs={tabDefs} value={activeTab} onValueChange={setActiveTab}>
              <TabsContent value="overview">
                <TrialDetailsMain
                  trial={trialWithClasses}
                  statistics={trialStatistics}
                  canManage={false}
                  onEditClass={NO_CLASS_ACTION}
                  onDeleteClass={NO_CLASS_ACTION}
                />
              </TabsContent>

              <TabsContent value="entries">
                <TrialEntriesTable trialId={trialWithClasses.id} />
              </TabsContent>
            </PrimaryTabs>
          </>
        ) : (
          <div role="status" aria-label="Loading trial details">
            <DetailPageSkeleton />
          </div>
        )}
      </PageShell>
    </>
  );
};

export default TrialDetailsPage;
