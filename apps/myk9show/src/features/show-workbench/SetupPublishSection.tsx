import { Megaphone } from 'lucide-react';
import { PremiumDownloadCard } from '@/features/premium/PremiumDownloadCard';
import { LandingPageCard } from '@/features/premium/LandingPageCard';
import type { ShowStyle } from '@/features/registries';
import { SETUP_PUBLISH_ANCHOR } from './setupReadinessSignals';

interface SetupPublishSectionProps {
  showId: string;
  showStyle: ShowStyle;
}

// INTENT: Visually groups the Premium PDF + Landing Page cards under a
// single "Publish" header. The underlying cards stay reusable for the
// public ShowDetailsPage; this section only adds a labeled wrapper so
// Setup feels like coherent stages rather than two more scattered cards.
export function SetupPublishSection({ showId, showStyle }: SetupPublishSectionProps) {
  return (
    // scroll-mt keeps the anchor target clear of the fixed app header
    // when the readiness chip jumps here.
    <section id={SETUP_PUBLISH_ANCHOR} className="scroll-mt-20" aria-labelledby="setup-publish-heading">
      <div className="mb-2 flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h3
          id="setup-publish-heading"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Publish
        </h3>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PremiumDownloadCard showId={showId} showStaleBadge />
        <LandingPageCard showId={showId} showStyle={showStyle} />
      </div>
    </section>
  );
}
