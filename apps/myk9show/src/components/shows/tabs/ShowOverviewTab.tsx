import { useMemo } from 'react';
import type { Show } from '@/types/show-types';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import { ScheduleSummary } from '@/components/shows/overview/ScheduleSummary';
import { ShowOfficials } from '@/components/shows/overview/ShowOfficials';
import { JudgesList } from '@/components/shows/overview/JudgesList';
import { VenueMap } from '@/components/shows/overview/VenueMap';
import { MoreFromClub } from '@/components/shows/overview/MoreFromClub';
import { ShareEvent } from '@/components/shows/overview/ShareEvent';
import { ShowAccessCodesCard } from '@/components/secretary/ShowAccessCodesCard';
import { Button } from '@/components/ui/button';
import { summarizeShowClasses, type ShowClassSummaryClass } from './showClassSummary';

const baseUrl =
  (import.meta.env.VITE_PUBLIC_URL as string | undefined) ??
  (typeof window !== 'undefined' ? window.location.origin : '');

interface ShowOverviewTabProps {
  show: Show;
  isAuthenticated?: boolean;
  canManageShow?: boolean;
  judges?: ShowJudgeAssignment[];
  classes?: ShowClassSummaryClass[];
  onViewClasses?: () => void;
}

export function ShowOverviewTab({
  show,
  isAuthenticated = false,
  canManageShow = false,
  judges,
  classes,
  onViewClasses,
}: ShowOverviewTabProps) {
  const shareData = useMemo(
    () => ({
      title: show.name,
      text: `${show.organization ? `${show.organization} ` : ''}Dog Show in ${show.location} · ${show.clubName}`,
      url: `${baseUrl}/shows/${show.id}`,
    }),
    [show.id, show.name, show.organization, show.location, show.clubName]
  );
  const classSummary = summarizeShowClasses(classes ?? []);
  const hasClasses = classSummary.totalClasses > 0;
  const visibleClassLabels = [...classSummary.elementLabels, ...classSummary.levelLabels].slice(
    0,
    6
  );

  return (
    <div className="space-y-6">
      {/* Two-column layout: main content + sidebar */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr,340px] gap-6">
        {/* Main content column */}
        <div className="space-y-6 order-2 md:order-1">
          {hasClasses ? (
            <section
              className="rounded-lg border bg-card p-4 shadow-sm"
              aria-labelledby="classes-offered-heading"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div>
                    <h2
                      id="classes-offered-heading"
                      className="text-lg font-semibold text-foreground"
                    >
                      Classes offered
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {classSummary.totalClasses}{' '}
                      {classSummary.totalClasses === 1 ? 'class' : 'classes'}
                      {classSummary.trialLabels.length > 0
                        ? ` across ${classSummary.trialLabels.length} ${classSummary.trialLabels.length === 1 ? 'trial' : 'trials'}`
                        : ''}
                    </p>
                  </div>
                  {visibleClassLabels.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {visibleClassLabels.map(label => (
                        <span
                          key={label}
                          className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-foreground"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                {onViewClasses ? (
                  <Button type="button" variant="outline" onClick={onViewClasses}>
                    View all classes
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
          <ScheduleSummary showId={show.id} canEditSchedule={canManageShow} compact />
          <VenueMap location={show.location} />
        </div>

        {/* Sidebar — on mobile, appears above main content */}
        <div className="space-y-6 order-1 md:order-2">
          <ShowOfficials showId={show.id} />
          <JudgesList judges={judges ?? show.assignedJudges} />
          <ShareEvent shareData={shareData} />
          {isAuthenticated && (
            <ShowAccessCodesCard
              showId={show.id}
              showName={show.name}
              canLoadCodes
              // Server authorization determines the visible role union.
              // Only managers receive the destructive reset control.
              canRegenerate={canManageShow}
            />
          )}
        </div>
      </div>

      {/* More from club — full width */}
      <MoreFromClub clubId={show.clubId} clubName={show.clubName} currentShowId={show.id} />
    </div>
  );
}
