import React from 'react';
import { Outlet } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { DetailHero } from '@/components/common/DetailHero';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ShowDateBlock } from '@/components/shows/ShowDateBlock';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import {
  ShowDetailTabs,
  type ShowDetailTabsProps,
} from '@/components/shows/ShowDetails/ShowDetailTabs';
import type { EntryStatus, EntryStatusInfo } from '@/utils/entryStatusUtils';
import type { Show } from '@/types/show-types';

const ENTRY_STATUS_HERO_VARIANT: Record<
  EntryStatus,
  'success' | 'warning' | 'destructive' | 'default'
> = {
  accepting: 'success',
  closing_soon: 'warning',
  closed: 'destructive',
  submitted: 'default',
  not_yet_open: 'default',
  setup_incomplete: 'default',
};

export interface ShowExhibitorViewProps {
  show: Show;
  breadcrumbs: React.ComponentProps<typeof PageHeader>['breadcrumbs'];
  catalogEntryCount: number;
  entryStatus: EntryStatusInfo;
  hasUserEntries: boolean;
  onRegister: () => void;
  /**
   * True when the URL targets a management section — even a non-staff visitor on
   * such a URL renders the section `<Outlet/>` (the section guards itself), as in
   * the pre-split shared body.
   */
  isManagementSection: boolean;
  /** True while the my-entries default-tab decision is still resolving. */
  isWaitingForEntryDefault: boolean;
  /** The fully-built tab props (shared with the management shell). */
  tabs: ShowDetailTabsProps;
}

/**
 * The authenticated, non-staff exhibitor surface: the show hero with the entry
 * CTAs plus the shared tabbed body. No management chrome (nav, publish row,
 * edit/delete) — that lives in ShowManagementShell.
 */
export function ShowExhibitorView({
  show,
  breadcrumbs,
  catalogEntryCount,
  entryStatus,
  hasUserEntries,
  onRegister,
  isManagementSection,
  isWaitingForEntryDefault,
  tabs,
}: ShowExhibitorViewProps) {
  const hasClasses = tabs.classes.length > 0;

  return (
    <PageShell>
      <PageHeader breadcrumbs={breadcrumbs} title={show.name || 'Show Details'} />

      <DetailHero
        cover={
          show.startDate ? (
            <ShowDateBlock startDate={show.startDate} endDate={show.endDate} />
          ) : undefined
        }
        name={show.name || 'Untitled Show'}
        subtitle={show.clubName || undefined}
        badges={[
          ...(show.organization ? [{ label: show.organization, variant: 'default' as const }] : []),
          {
            label: entryStatus.label,
            variant: ENTRY_STATUS_HERO_VARIANT[entryStatus.status],
          },
        ]}
        metadata={[]}
        closedMessage={!entryStatus.canEnter ? entryStatus.description : undefined}
        secondaryActions={
          <div className="flex flex-wrap items-center justify-end gap-3">
            {/* INTENT: let an exhibitor confirm their dog fits the offered
                classes/levels BEFORE committing to registration. Deep-links
                the existing Classes tab — no new eligibility surface
                (UX-P2-04). */}
            {hasClasses && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px] sm:min-h-8"
                onClick={() => tabs.onTabChange('classes')}
              >
                See classes
              </Button>
            )}
            {entryStatus.canEnter ? (
              // Primary entry CTA: the shared Button (default = filled
              // var(--primary)) so it honors the user's accent and the
              // semantic focus ring, instead of a hardcoded Clay hex that
              // broke under Grove/Dusk/Heather. Filled vs the outline
              // siblings keeps it the dominant action.
              <Button size="sm" className="min-h-[44px] sm:min-h-8" onClick={onRegister}>
                {hasUserEntries ? 'Manage Entry' : 'Enter This Show'}
              </Button>
            ) : hasUserEntries ? (
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px] sm:min-h-8"
                onClick={onRegister}
              >
                View Entry
              </Button>
            ) : null}
          </div>
        }
        footer={<QuickInfoCards show={show} canManageShow={false} entryCount={catalogEntryCount} />}
      />

      {isManagementSection ? (
        <Outlet />
      ) : isWaitingForEntryDefault ? (
        <div className="mt-6">
          <LoadingSkeleton variant="cards" count={2} />
        </div>
      ) : (
        <ShowDetailTabs {...tabs} />
      )}
    </PageShell>
  );
}
