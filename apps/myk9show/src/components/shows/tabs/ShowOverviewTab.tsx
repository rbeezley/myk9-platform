import { useMemo } from 'react';
import type { Show } from '@/types/show-types';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import { EntryCTA } from '@/components/shows/overview/EntryCTA';
import { ScheduleSummary } from '@/components/shows/overview/ScheduleSummary';
import { ShowOfficials } from '@/components/shows/overview/ShowOfficials';
import { JudgesList } from '@/components/shows/overview/JudgesList';
import { VenueMap } from '@/components/shows/overview/VenueMap';
import { AdditionalDetails } from '@/components/shows/overview/AdditionalDetails';
import { MoreFromClub } from '@/components/shows/overview/MoreFromClub';
import { ShareEvent } from '@/components/shows/overview/ShareEvent';

const baseUrl =
  (import.meta.env.VITE_PUBLIC_URL as string | undefined) ??
  (typeof window !== 'undefined' ? window.location.origin : '');

interface ShowOverviewTabProps {
  show: Show;
  onRegister: () => void;
}

export function ShowOverviewTab({ show, onRegister }: ShowOverviewTabProps) {
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
      {/* Quick info bar — full width */}
      <QuickInfoCards show={show} />

      {/* Entry CTA — full width, always visible before the grid */}
      <EntryCTA show={show} onRegister={onRegister} />

      {/* Two-column layout: main content + sidebar */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr,340px] gap-6">
        {/* Main content column */}
        <div className="space-y-6 order-2 md:order-1">
          <ScheduleSummary showId={show.id} />
          <VenueMap location={show.location} />
          <AdditionalDetails show={show} />
        </div>

        {/* Sidebar — on mobile, appears between EntryCTA and main content */}
        <div className="space-y-6 order-1 md:order-2">
          <ShowOfficials chairmanId={show.chairman} secretaryId={show.secretary} />
          <JudgesList judges={show.assignedJudges} />
          <ShareEvent shareData={shareData} />
        </div>
      </div>

      {/* More from club — full width */}
      <MoreFromClub clubId={show.clubId} clubName={show.clubName} currentShowId={show.id} />
    </div>
  );
}
