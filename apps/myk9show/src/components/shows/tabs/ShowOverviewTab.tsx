import { useMemo } from 'react';
import type { Show } from '@/types/show-types';
import { ScheduleSummary } from '@/components/shows/overview/ScheduleSummary';
import { ShowOfficials } from '@/components/shows/overview/ShowOfficials';
import { JudgesList } from '@/components/shows/overview/JudgesList';
import { VenueMap } from '@/components/shows/overview/VenueMap';
import { MoreFromClub } from '@/components/shows/overview/MoreFromClub';
import { ShareEvent } from '@/components/shows/overview/ShareEvent';

const baseUrl =
  (import.meta.env.VITE_PUBLIC_URL as string | undefined) ??
  (typeof window !== 'undefined' ? window.location.origin : '');

interface ShowOverviewTabProps {
  show: Show;
}

export function ShowOverviewTab({ show }: ShowOverviewTabProps) {
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
          <ShowOfficials
            chairmanId={show.chairman}
            secretaryId={show.secretary}
            chiefStewardId={show.chiefSteward}
          />
          <JudgesList judges={show.assignedJudges} />
          <ShareEvent shareData={shareData} />
        </div>
      </div>

      {/* More from club — full width */}
      <MoreFromClub clubId={show.clubId} clubName={show.clubName} currentShowId={show.id} />
    </div>
  );
}
