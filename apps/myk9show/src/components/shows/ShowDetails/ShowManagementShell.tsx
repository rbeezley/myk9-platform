import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { DetailHero } from '@/components/common/DetailHero';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ShowDateBlock } from '@/components/shows/ShowDateBlock';
import { ShowStatusPill } from '@/components/shows/ShowStatusPill';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import { ShowPresenceStack } from '@/features/show-presence/ShowPresenceStack';
import { LiveUpdateIndicator } from '@/features/show-live-sync/LiveUpdateIndicator';
import { PremiumDownloadCard } from '@/features/premium/PremiumDownloadCard';
import { LandingPageCard } from '@/features/premium/LandingPageCard';
import { ShowEditPanel } from '@/components/panels/edit/ShowEditPanel';
import { showDeleteDetail } from '@/features/delete';
import { useAuthContext } from '@/hooks/useAuthContext';
import { canDeleteShowForClub } from '@/components/clubs/ClubDetails/clubPermissions';
import { type ShowDetailTabsProps } from '@/components/shows/ShowDetails/ShowDetailTabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { TabsContent } from '@/components/ui/tabs';
import { ShowOverviewTab } from '@/components/shows/tabs/ShowOverviewTab';
import { buildClassEntryBreakdowns } from '@/features/entry-operations/classEntryBreakdown';
import { getShowStyle } from '@/features/registries';
import {
  premiumPublishDraftKey,
  runPremiumPublishOperation,
} from '@/features/premium/premiumPublishCoordinator';
import {
  classifyPremiumPublishError,
  PremiumPublishError,
  premiumPublishFailureMessage,
} from '@/features/premium/premiumPublishErrors';
import { fetchShowJudgesForPublish, saveShowJudgeChanges } from '@/services/database/judges';
import {
  SHOW_EDIT_TAB_PARAM,
  normalizeShowEditTab,
  DEFAULT_SHOW_EDIT_TAB,
  type ShowEditTab,
} from '@/components/shows/showEditRoutes';
import { useShowStore, type ShowInput } from '@/store/showStore';
import { showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import { SHOW_TABS, type ShowTabId } from '@/routes/showManagementSections';
import { SETUP_PUBLISH_ANCHOR } from '@/features/show-workbench/setupReadinessSignals';
import { SHOW_STATUS_CONTROL_ANCHOR } from '@/features/show-workbench/publishReadiness';
import type { Show } from '@/types/show-types';
import type { GeneratedPremium } from '@/types/premium-types';
import { useShowManageScope } from '@/hooks/useShowManageScope';
import { ShowDeskCompactContext } from './ShowDeskCompactContext';
import { applyShowFormDataToPremium } from './showFormPremiumSync';
import { ShowPageHeaderActions } from './ShowPageHeaderActions';
import { showHeroParent } from './showHeroParent';
import type { HeroViewer } from '@/components/common/heroParentLink';

export interface ShowManagementShellProps {
  show: Show;
  /** From the fast-loader; gates the delete dialog (null on a list-fallback load). */
  showId: string | null;
  breadcrumbs: React.ComponentProps<typeof PageHeader>['breadcrumbs'];
  armbandCount: number | undefined;
  catalogEntryCount: number;
  canonicalShowHref: string;
  activeManagementSection: string | undefined;
  /** The fully-built tab data, handed to every tab page through the outlet. */
  tabs: ShowDetailTabsProps;
  /** The six show tabs with their badges (`buildShowManagementTabDefs`). */
  sectionTabs: PrimaryTabDef[];
  entryDataState?: 'ready' | 'loading' | 'error';
  onRetryEntryData?: (() => void) | undefined;
  /** Whether the hero's parent links may be followed (see `heroParentLink`). Safe default: no. */
  heroViewer?: HeroViewer;
}

/**
 * The management surface for anyone who manages this show — site admin,
 * club-scoped secretary, or club-scoped CLUB ADMIN (MYK9-630 phase 3; before it
 * club admins were held on the exhibitor view by a second, narrower predicate,
 * which is what made the old settings link inert for them, MYK9-653).
 *
 * The show hero with staff actions
 * (presence, status, edit/delete), the publish row, the section nav, and either
 * the active management section (`<Outlet/>`) or the shared tabbed body. Owns the
 * edit/delete dialogs and the save pipeline. Presence UI relies on the
 * ShowPresenceProvider the router wraps this shell in.
 */
type AuthorizedShowManagementShellProps = ShowManagementShellProps & {
  canManageShow: boolean;
};

/**
 * Keep the management tree structurally absent until the canonical ownership
 * answer is final. In particular, a disabled publish query may still have
 * cached data, so passing a false flag into mounted management children is not
 * enough to prevent stale controls from flashing during auth transitions.
 */
export function ShowManagementShell(props: ShowManagementShellProps) {
  const manageScope = useShowManageScope(props.show.id);
  const queryClient = useQueryClient();

  if (manageScope.status === 'resolving') {
    return (
      <PageShell>
        <LoadingSkeleton variant="cards" count={3} heading="Checking show access" />
      </PageShell>
    );
  }

  if (manageScope.status === 'unavailable') {
    return (
      <PageShell>
        <ErrorState
          message="We couldn't verify show access."
          description="The management view is paused until show access can be confirmed."
          onRetry={() => {
            void queryClient.invalidateQueries({ queryKey: showQueryKeys.detail(props.show.id) });
          }}
          headingLevel={1}
        />
      </PageShell>
    );
  }

  if (!manageScope.canManage) return null;

  return <AuthorizedShowManagementShell {...props} canManageShow={manageScope.canManage} />;
}

function AuthorizedShowManagementShell({
  show,
  showId,
  breadcrumbs,
  armbandCount,
  catalogEntryCount,
  canonicalShowHref,
  activeManagementSection,
  tabs,
  sectionTabs,
  entryDataState = 'ready',
  onRetryEntryData,
  heroViewer = 'public',
  canManageShow,
}: AuthorizedShowManagementShellProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const updateShowLocally = useShowStore(s => s.updateShow);
  // Read from the ROUTER's params, not `window.location`: this shell is mounted
  // by the router, and an in-app navigation that never touches `window.location`
  // must be seen the same way a cold load is. Captured in a `useState`
  // INITIALIZER, which runs once on the first render -- the effect below strips
  // both params straight after, and reading them during a later render would
  // come back null and snap the panel back to Basic Info while the secretary
  // was looking at Judges (F4/F12).
  const [showEditPanel, setShowEditPanel] = useState(() => searchParams.get('edit') === 'true');
  const [editPanelTab] = useState<ShowEditTab>(() =>
    normalizeShowEditTab(searchParams.get(SHOW_EDIT_TAB_PARAM))
  );
  const editParam = searchParams.get('edit');
  useEffect(() => {
    // Strip both so a refresh or a shared URL does not reopen the editor. Keyed
    // on `editParam` rather than mount, because an in-app edit link can put it
    // back on a page that is already mounted.
    const hadEdit = searchParams.get('edit') === 'true';
    const hadTab = searchParams.get(SHOW_EDIT_TAB_PARAM) !== null;
    if (hadEdit || hadTab) {
      searchParams.delete('edit');
      searchParams.delete(SHOW_EDIT_TAB_PARAM);
      setSearchParams(searchParams, { replace: true });
    }
  }, [editParam]);

  // Reopening from an edit link should start on Basic Info, not on whatever tab
  // a deep link once asked for -- the deep link is a one-shot instruction, not
  // a preference.
  const [editPanelOpenedByLink, setEditPanelOpenedByLink] = useState(
    () => searchParams.get('edit') === 'true'
  );
  const openEditPanel = () => {
    setEditPanelOpenedByLink(false);
    setShowEditPanel(true);
  };

  // An in-app edit link can replace the search without remounting this shell,
  // so the initializer above can never see a newly-arrived `edit=true`. This
  // is React's "adjust state when an input changes" pattern, during render on
  // purpose: the same thing in an effect costs a second render pass with the
  // panel shut and trips the cascading-renders lint.
  const [seenEditParam, setSeenEditParam] = useState(editParam);
  if (editParam !== seenEditParam) {
    setSeenEditParam(editParam);
    // A later arrival opens on Basic Info: the deep link's tab was a one-shot
    // instruction for the load that carried it, not a standing preference.
    if (editParam === 'true') openEditPanel();
  }

  // Hidden for a viewer `soft_delete_show` would refuse (a show-scoped secretary, say).
  const { userWithRoles } = useAuthContext();
  const canDeleteShow = canDeleteShowForClub(userWithRoles, {
    clubId: show.clubId,
    showId: show.id,
  });
  const entryDataUnavailable = entryDataState !== 'ready';
  const entryBreakdownByClassId = useMemo(
    () =>
      canManageShow && !entryDataUnavailable
        ? buildClassEntryBreakdowns(tabs.mapEntries)
        : undefined,
    [canManageShow, entryDataUnavailable, tabs.mapEntries]
  );
  const isShowDesk = activeManagementSection === 'show-day';
  // The retired Class Management URL (`classes/:trialId`) redirects into Setup → Classes, so
  // it keeps Setup lit for the frame it renders rather than lighting nothing.
  const activeTabId: ShowTabId =
    SHOW_TABS.find(tab => tab.path === activeManagementSection)?.id ??
    (activeManagementSection === 'classes' ? 'setup' : 'overview');
  const goToTab = (id: string) => {
    const tab = SHOW_TABS.find(item => item.id === id);
    if (!tab) return;
    // Replace, never push (owner decision 5): Back from a tab leaves the show.
    navigate(tab.path ? `${canonicalShowHref}/${tab.path}` : canonicalShowHref, { replace: true });
  };

  // The shared dialog has already purged the show and refreshed its lists.
  const handleShowDeleted = () => navigate('/shows');

  return (
    <>
      <PageShell>
        {isShowDesk ? (
          <ShowDeskCompactContext
            show={show}
            canonicalShowHref={canonicalShowHref}
            armbandCount={armbandCount}
            canManageShow={canManageShow}
          />
        ) : (
          <>
            <PageHeader
              breadcrumbs={breadcrumbs}
              title={show.name || 'Show Details'}
              omitTitle
              actions={<ShowPageHeaderActions showId={show.id} armbandCount={armbandCount} />}
            />

            <DetailHero
              cover={
                show.startDate ? (
                  <ShowDateBlock startDate={show.startDate} endDate={show.endDate} />
                ) : undefined
              }
              name={show.name || 'Untitled Show'}
              headingLevel={1}
              parent={showHeroParent(show, { viewer: heroViewer })}
              badges={
                show.organization ? [{ label: show.organization, variant: 'default' as const }] : []
              }
              metadata={[]}
              headerActions={
                <>
                  <LiveUpdateIndicator />
                  <ShowPresenceStack />
                  <span id={SHOW_STATUS_CONTROL_ANCHOR} className="scroll-mt-20">
                    <ShowStatusPill
                      showId={show.id}
                      status={show.status}
                      clubId={show.clubId}
                      entryOpenDate={show.entryOpenDate}
                      entryCloseDate={show.entryCloseDate}
                    />
                  </span>
                </>
              }
              footer={
                <QuickInfoCards
                  show={show}
                  canManageShow={canManageShow}
                  entryCount={entryDataUnavailable ? null : catalogEntryCount}
                />
              }
            />
          </>
        )}

        {entryDataUnavailable && (
          <div className="mt-4 rounded-md border border-dashed bg-muted/20 px-4 py-3 text-sm">
            <div className="font-medium text-foreground">
              {entryDataState === 'loading'
                ? 'Entry counts are loading.'
                : "Couldn't load entry counts."}
            </div>
            <p className="mt-1 text-muted-foreground">
              Entry-derived counts and Show Map are paused so this page does not show a false
              zero-entry state.
            </p>
            {entryDataState === 'error' && onRetryEntryData && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={onRetryEntryData}
              >
                Retry
              </Button>
            )}
          </div>
        )}

        {/* INTENT: the publish row lives on Overview ONLY (Richard, decision 2).
            It was an always-on row on every section except Show Desk, which put
            the same two cards in front of a secretary who had navigated to
            Reports or Results to do something else; the header Actions menu's
            "Generate & publish premium" is the way back to it from anywhere.
            Show Desk keeps its compact publishing exception instead. */}
        {!activeManagementSection && (
          <div
            id={SETUP_PUBLISH_ANCHOR}
            // `scroll-mt-20` only: the `target:ring-*` classes could never
            // fire, because the one link carrying `#setup-publish` is a router
            // `<Link>` and a `pushState` is not fragment navigation
            // (MYK9-630 round 5). Scrolling still works; the ring never did.
            className="mt-4 grid scroll-mt-20 grid-cols-1 gap-3 rounded-md sm:grid-cols-2"
          >
            <PremiumDownloadCard
              showId={show.id}
              showStaleBadge={true}
              canManageShow={canManageShow}
            />
            <LandingPageCard showId={show.id} showStyle={getShowStyle(show)} />
          </div>
        )}

        {/* INTENT: ONE horizontal row on this page, and it is the tabs
            (MYK9-630 phase 2). The five standalone page links that used to sit
            above a six-tab strip are gone: every tab below IS one of those
            pages. Anything else that navigates from here is an inline link
            inside the body, or a verb in the header Actions menu. */}
        {show?.id && (
          <PrimaryTabs
            tabs={sectionTabs}
            value={activeTabId}
            onValueChange={goToTab}
            className="mt-4"
          >
            <TabsContent value={activeTabId}>
              {activeManagementSection ? (
                <Outlet context={tabs} />
              ) : (
                <ShowOverviewTab
                  show={show}
                  isAuthenticated={true}
                  canManageShow={canManageShow}
                  judges={tabs.judges}
                  classes={tabs.classes}
                  entryBreakdownByClassId={entryBreakdownByClassId}
                  onViewClasses={() => navigate(`${canonicalShowHref}/setup?section=classes`)}
                />
              )}
            </TabsContent>
          </PrimaryTabs>
        )}
      </PageShell>

      {/* Dialogs */}
      <ShowEditPanel
        open={showEditPanel}
        initialTab={editPanelOpenedByLink ? editPanelTab : DEFAULT_SHOW_EDIT_TAB}
        onClose={() => setShowEditPanel(false)}
        showId={show.id || ''}
        showName={show.name || ''}
        initialShowData={show || {}}
        onDelete={
          showId && canDeleteShow
            ? {
                kind: 'show',
                objectLabel: 'show',
                targets: [
                  {
                    id: showId,
                    name: show.name || 'Untitled show',
                    detail: showDeleteDetail(show),
                    context: { showId },
                  },
                ],
                onDeleted: handleShowDeleted,
              }
            : undefined
        }
        onSave={async showData => {
          if (show.id) {
            const id = show.id;
            const publishableShowData = showData as Partial<ShowInput> & {
              publishExperience?: boolean;
              generatedPremium?: GeneratedPremium;
              inkSaver?: boolean;
            };
            const persistShowChanges = async () => {
              const localShow = await updateShowLocally(id, showData as Partial<ShowInput>);
              if (!localShow) {
                throw new Error('Show was not available in the local store.');
              }
              // Save only what the secretary changed in the judge list: the
              // loaded list can be empty because a device read failed, and
              // replacing it deleted the real judges (MYK9-772).
              await saveShowJudgeChanges(
                id,
                show.assignedJudges || [],
                showData.assignedJudges || []
              );
              // `localShow` is a StoreShow and carries no `trials`; merge rather
              // than replace, or the query's embedded trials are wiped (MYK9-676).
              queryClient.setQueryData<Show>(showQueryKeys.detail(id), current => ({
                ...current,
                ...localShow,
              }));
              queryClient.setQueryData<Show[]>(showQueryKeys.lists(), current =>
                current?.map(s => (s.id === id ? { ...s, ...localShow } : s))
              );
            };

            if (publishableShowData.publishExperience && publishableShowData.generatedPremium) {
              // Save the edits first. Publication can fail before it ever asks
              // for the premium (reservation denied, RPC unavailable, or a
              // lost-response retry that reconciles as already committed), and
              // none of those may discard what the secretary just typed.
              await persistShowChanges();
              try {
                // The form's judge list is a device read and is empty when that
                // read failed; the published premium lists the server's judges,
                // and only when this device agrees with them (MYK9-774).
                const judges = await fetchShowJudgesForPublish(id);
                const premium = applyShowFormDataToPremium(
                  publishableShowData.generatedPremium,
                  showData as Partial<ShowInput>,
                  judges
                );
                await runPremiumPublishOperation({
                  showId: id,
                  mode: 'draft',
                  intentKey: premiumPublishDraftKey({
                    premium,
                    inkSaver: Boolean(publishableShowData.inkSaver),
                  }),
                  inkSaver: Boolean(publishableShowData.inkSaver),
                  createPremium: async () => premium,
                });
              } catch (error) {
                const classified = classifyPremiumPublishError(error, 'experience-snapshot');
                throw new PremiumPublishError(
                  premiumPublishFailureMessage(classified),
                  classified.stage,
                  classified.code,
                  error
                );
              }
              queryClient.invalidateQueries({ queryKey: ['shows', id, 'publish-info'] });
              queryClient.invalidateQueries({
                queryKey: ['shows', id, 'published-experience-content'],
              });
              queryClient.invalidateQueries({ queryKey: showQueryKeys.detail(id) });
              queryClient.invalidateQueries({ queryKey: showQueryKeys.lists() });
            } else {
              await persistShowChanges();
            }
          }
          setShowEditPanel(false);
        }}
      />
    </>
  );
}
