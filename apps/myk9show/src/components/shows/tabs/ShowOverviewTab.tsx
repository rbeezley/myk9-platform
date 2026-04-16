import { useMemo } from 'react';
import type { Show } from '@/types/show-types';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import { ScheduleSummary } from '@/components/shows/overview/ScheduleSummary';
import { ShowOfficials } from '@/components/shows/overview/ShowOfficials';
import { JudgesList } from '@/components/shows/overview/JudgesList';
import { VenueMap } from '@/components/shows/overview/VenueMap';
import { MoreFromClub } from '@/components/shows/overview/MoreFromClub';
import { ShareEvent } from '@/components/shows/overview/ShareEvent';
import { MyK9QAccessCard } from '@/components/secretary/MyK9QAccessCard';

const baseUrl =
  (import.meta.env.VITE_PUBLIC_URL as string | undefined) ??
  (typeof window !== 'undefined' ? window.location.origin : '');

interface ShowOverviewTabProps {
  show: Show;
  canManageShow?: boolean;
  judges?: ShowJudgeAssignment[];
}

export function ShowOverviewTab({ show, canManageShow = false, judges }: ShowOverviewTabProps) {
  const shareData = useMemo(
    () => ({
      title: show.name,
      text: `${show.organization ? `${show.organization} ` : ''}Dog Show in ${show.location} · ${show.clubName}`,
      url: `${baseUrl}/shows/${show.id}`,
    }),
    [show.id, show.name, show.organization, show.location, show.clubName]
  );

  return (
    <div className="space-y-6">
      {/* Two-column layout: main content + sidebar */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr,340px] gap-6">
        {/* Main content column */}
        <div className="space-y-6 order-2 md:order-1">
          <ScheduleSummary showId={show.id} />
          <VenueMap location={show.location} />
        </div>

        {/* Sidebar — on mobile, appears above main content */}
        <div className="space-y-6 order-1 md:order-2">
          <ShowOfficials showId={show.id} />
          <JudgesList judges={judges ?? show.assignedJudges} />
          <ShareEvent shareData={shareData} />
          <MyK9QAccessCard
            showId={show.id}
            showName={show.name}
            {...(!canManageShow ? { visibleRoles: ['Exhibitor'] } : {})}
          />
        </div>
      </div>

      {/* More from club — full width */}
      <MoreFromClub clubId={show.clubId} clubName={show.clubName} currentShowId={show.id} />
    </div>
  );
}
