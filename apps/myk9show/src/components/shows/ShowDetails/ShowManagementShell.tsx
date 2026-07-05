import React, { useState, useEffect } from 'react';
import { Link, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2, Pencil, MoreHorizontal, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { DetailHero } from '@/components/common/DetailHero';
import { ShowDateBlock } from '@/components/shows/ShowDateBlock';
import { ShowStatusPill } from '@/components/shows/ShowStatusPill';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import { ArmbandLookup } from '@/components/shows/ArmbandLookup';
import { ShowPresenceStack } from '@/features/show-presence/ShowPresenceStack';
import { LiveUpdateIndicator } from '@/features/show-live-sync/LiveUpdateIndicator';
import { PremiumDownloadCard } from '@/features/premium/PremiumDownloadCard';
import { LandingPageCard } from '@/features/premium/LandingPageCard';
import { ShowEditPanel } from '@/components/panels/edit/ShowEditPanel';
import DeleteShowDialog from '@/components/shows/ShowDetails/dialogs/DeleteShowDialog';
import {
  ShowDetailTabs,
  type ShowDetailTabsProps,
} from '@/components/shows/ShowDetails/ShowDetailTabs';
import { getShowStyle } from '@/features/registries';
import { publishExperience } from '@/features/experience/publishExperience';
import { persistShowJudgeAssignments } from '@/services/database/judges';
import { useShowStore, type ShowInput } from '@/store/showStore';
import { showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import { SHOW_MANAGEMENT_SECTIONS } from '@/routes/showManagementSections';
import { SETUP_PUBLISH_ANCHOR } from '@/features/show-workbench/setupReadinessSignals';
import { SHOW_STATUS_CONTROL_ANCHOR } from '@/features/show-workbench/publishReadiness';
import { notifications } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import type { Show } from '@/types/show-types';
import type { GeneratedPremium } from '@/types/premium-types';

function parseOptionalCurrency(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function applyShowFormDataToPremium(
  premium: GeneratedPremium,
  formData: Partial<ShowInput>
): GeneratedPremium {
  const preEntryFee = parseOptionalCurrency(formData.preEntryFee);
  const dayOfFee = parseOptionalCurrency(formData.dayOfShowFee);

  return {
    ...premium,
    style: (formData.style ?? premium.style) as GeneratedPremium['style'],
    show: {
      ...premium.show,
      name: formData.name ?? premium.show.name,
      startDate: formData.startDate ?? premium.show.startDate,
      endDate: formData.endDate ?? premium.show.endDate,
      venue: formData.location ?? premium.show.venue,
      entryOpenDate: formData.entryOpenDate ?? premium.show.entryOpenDate,
      entryCloseDate: formData.entryCloseDate ?? premium.show.entryCloseDate,
      preEntryFee: preEntryFee ?? premium.show.preEntryFee,
      dayOfFee: dayOfFee ?? premium.show.dayOfFee,
      acceptChecks: formData.acceptCheckPayments ?? premium.show.acceptChecks,
      acceptCash: formData.acceptCashPayments ?? premium.show.acceptCash,
    },
    trials: premium.trials.map(trial => ({
      ...trial,
      judges:
        formData.assignedJudges?.map(judge => ({
          name: judge.judgeName,
          elements: judge.assignedClasses ?? [],
        })) ?? trial.judges,
    })),
  };
}

export interface ShowManagementShellProps {
  show: Show;
  /** From the fast-loader; gates the delete dialog (null on a list-fallback load). */
  showId: string | null;
  breadcrumbs: React.ComponentProps<typeof PageHeader>['breadcrumbs'];
  armbandCount: number | undefined;
  catalogEntryCount: number;
  canonicalShowHref: string;
  activeManagementSection: string | undefined;
  isManagementSection: boolean;
  /** The fully-built tab props (shared with the exhibitor view). */
  tabs: ShowDetailTabsProps;
}

/**
 * The secretary / admin management surface: the show hero with staff actions
 * (presence, status, edit/delete), the publish row, the section nav, and either
 * the active management section (`<Outlet/>`) or the shared tabbed body. Owns the
 * edit/delete dialogs and the save pipeline. Presence UI relies on the
 * ShowPresenceProvider the router wraps this shell in.
 */
export function ShowManagementShell({
  show,
  showId,
  breadcrumbs,
  armbandCount,
  catalogEntryCount,
  canonicalShowHref,
  activeManagementSection,
  isManagementSection,
  tabs,
}: ShowManagementShellProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const updateShowLocally = useShowStore(s => s.updateShow);

  const [showEditPanel, setShowEditPanel] = useState(
    () => new URLSearchParams(window.location.search).get('edit') === 'true'
  );
  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      searchParams.delete('edit');
      setSearchParams(searchParams, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleConfirmDelete = () => {
    setShowDeleteDialog(false);
    queryClient.invalidateQueries({ queryKey: ['shows'] });
    setTimeout(() => navigate('/shows'), 100);
  };

  return (
    <>
      <PageShell>
        <PageHeader
          breadcrumbs={breadcrumbs}
          title={show.name || 'Show Details'}
          actions={
            (armbandCount ?? 0) > 0 && show?.id ? <ArmbandLookup showId={show.id} /> : undefined
          }
        />

        <DetailHero
          cover={
            show.startDate ? (
              <ShowDateBlock startDate={show.startDate} endDate={show.endDate} />
            ) : undefined
          }
          name={show.name || 'Untitled Show'}
          subtitle={show.clubName || undefined}
          badges={
            show.organization ? [{ label: show.organization, variant: 'default' as const }] : []
          }
          metadata={[]}
          headerActions={
            <>
              <LiveUpdateIndicator />
              <ShowPresenceStack />
              <span id={SHOW_STATUS_CONTROL_ANCHOR} className="scroll-mt-20">
                <ShowStatusPill showId={show.id} status={show.status} />
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="More show actions"
                    className="h-10 w-10 sm:h-9 sm:w-9"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to={`${canonicalShowHref}?preview=public`}>
                      <Eye className="h-4 w-4 mr-2" />
                      Preview as exhibitor
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowEditPanel(true)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
          footer={
            <QuickInfoCards show={show} canManageShow={true} entryCount={catalogEntryCount} />
          }
        />

        {/* INTENT: The publish row renders once, above the section tabs —
            it is show-level state the secretary needs on every tab. The
            Setup tab's readiness chip deep-links here via #setup-publish;
            the target: ring makes the jump visibly land somewhere. */}
        <div
          id={SETUP_PUBLISH_ANCHOR}
          className="mt-4 grid scroll-mt-20 grid-cols-1 gap-3 rounded-md sm:grid-cols-2 target:ring-2 target:ring-ring target:ring-offset-4 target:ring-offset-background"
        >
          <PremiumDownloadCard showId={show.id} showStaleBadge={true} />
          <LandingPageCard showId={show.id} showStyle={getShowStyle(show)} />
        </div>

        {show?.id && (
          <nav
            className="border-b border-border bg-background"
            aria-label="Show management sections"
            data-testid="canonical-show-management-nav"
          >
            <div className="flex max-w-full overflow-x-auto no-scrollbar px-4 sm:px-6">
              {SHOW_MANAGEMENT_SECTIONS.map(({ label, path }) => {
                const href = `${canonicalShowHref}/${path}`;
                const isActive = activeManagementSection === path;
                return (
                  <Link
                    key={path}
                    to={href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'min-h-11 shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}

        {isManagementSection ? <Outlet /> : <ShowDetailTabs {...tabs} />}
      </PageShell>

      {/* Dialogs */}
      <ShowEditPanel
        open={showEditPanel}
        onClose={() => setShowEditPanel(false)}
        showId={show.id || ''}
        showName={show.name || ''}
        initialShowData={show || {}}
        onSave={async showData => {
          if (show.id) {
            const id = show.id;
            const publishableShowData = showData as Partial<ShowInput> & {
              publishExperience?: boolean;
              generatedPremium?: GeneratedPremium;
              inkSaver?: boolean;
            };
            const localShow = await updateShowLocally(id, showData as Partial<ShowInput>);
            if (!localShow) {
              throw new Error('Show was not available in the local store.');
            }
            // Persist judge assignments to judge_assignments table
            await persistShowJudgeAssignments(id, showData.assignedJudges || []);
            queryClient.setQueryData<Show>(showQueryKeys.detail(id), localShow);
            queryClient.setQueryData<Show[]>(showQueryKeys.lists(), current =>
              current?.map(s => (s.id === id ? localShow : s))
            );

            if (publishableShowData.publishExperience && publishableShowData.generatedPremium) {
              await publishExperience({
                showId: id,
                premium: applyShowFormDataToPremium(
                  publishableShowData.generatedPremium,
                  showData as Partial<ShowInput>
                ),
                inkSaver: Boolean(publishableShowData.inkSaver),
              });
              queryClient.invalidateQueries({ queryKey: ['shows', id, 'publish-info'] });
              queryClient.invalidateQueries({
                queryKey: ['shows', id, 'published-experience-content'],
              });
              queryClient.invalidateQueries({ queryKey: showQueryKeys.detail(id) });
              queryClient.invalidateQueries({ queryKey: showQueryKeys.lists() });
            }
          }
          notifications.success('Show changes saved');
          setShowEditPanel(false);
        }}
      />
      {showDeleteDialog && showId && (
        <DeleteShowDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          showId={showId}
          onDelete={handleConfirmDelete}
          showName={show.name || 'Unknown Show'}
        />
      )}
    </>
  );
}
