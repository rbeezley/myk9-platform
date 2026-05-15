import { useEffect } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { ensureBannerFontsLoaded } from '../fonts';
import { useBannerLandingData } from './useBannerLandingData';
import { FlagMasthead } from './sections/FlagMasthead';
import { StickyNav } from './sections/StickyNav';
import { WelcomeSection } from './sections/WelcomeSection';
import { ParticularsSection } from './sections/ParticularsSection';
import { JudgesSection } from './sections/JudgesSection';
import { RosterSection } from './sections/RosterSection';
import { PlanSection } from './sections/PlanSection';
import { OnTheDaySection } from './sections/OnTheDaySection';
import { OfficersSection } from './sections/OfficersSection';
import { FinalFlagBand } from './sections/FinalFlagBand';
import { BannerFooter } from './sections/BannerFooter';
import '../banner.css';

interface BannerLandingPageProps {
  show: Show | null | undefined;
  trial: Trial | null | undefined;
  allTrials: Trial[];
}

/**
 * Banner-style public trial landing page. Renders when
 * `getShowStyle(show) === 'banner'`.
 *
 * Sets the per-club flag color on the `[data-banner]` root via three CSS
 * vars so descendant elements can read them without prop-drilling. The
 * `useBannerBrandColor` hook does the math; the bundle is also passed
 * through component props for sections that need it inline (FlagBar
 * background, gradient bar fill, etc).
 */
export function BannerLandingPage({ show, trial, allTrials }: BannerLandingPageProps) {
  useEffect(() => {
    ensureBannerFontsLoaded();
  }, []);

  const data = useBannerLandingData(show, trial, allTrials);
  const { brandColors } = data;

  return (
    <div
      data-banner
      className="min-h-screen"
      style={
        {
          background: 'var(--bn-paper, #fafaf8)',
          color: 'var(--bn-ink, #111111)',
          ['--bn-flag' as string]: brandColors.flag,
          ['--bn-flag-deep' as string]: brandColors.flagDeep,
          ['--bn-flag-bright' as string]: brandColors.flagBright,
          ['--bn-text-on-flag' as string]: brandColors.textOnFlag,
        } as React.CSSProperties
      }
    >
      <title>
        {data.showName} · {data.clubName}
      </title>
      <meta
        name="description"
        content={data.welcomeText ?? `${data.showName} — ${data.showSubtitle}`}
      />
      <meta property="og:title" content={`${data.showName} · ${data.clubName}`} />
      <meta property="og:description" content={data.showSubtitle} />
      <meta property="og:type" content="event" />
      <meta property="og:url" content={typeof window !== 'undefined' ? window.location.href : ''} />
      <meta name="twitter:card" content="summary" />

      <FlagMasthead
        brandColors={brandColors}
        showName={data.showName}
        showSubtitle={data.showSubtitle}
        clubName={data.clubName}
        trialStartDate={data.trialStartDate}
        trialEndDate={data.trialEndDate}
        entryCloseDate={data.entryCloseDate}
        entryLimit={data.entryLimit}
        venueName={data.venueName}
        venueCity={data.venueCity}
        timezone={data.timezone}
        entryWizardUrl={data.entryWizardUrl}
      />

      <StickyNav
        flag={brandColors.flag}
        entryCount={data.entryCount}
        entryLimit={data.entryLimit}
      />

      <main>
        <WelcomeSection
          welcomeText={data.welcomeText}
          trialChairName={data.trialChairName}
          flag={brandColors.flag}
        />
        <ParticularsSection
          licenseLanguage={data.licenseLanguage}
          entryOpenDate={data.entryOpenDate}
          entryCloseDate={data.entryCloseDate}
          confirmationDate={data.confirmationDate}
          entryLimit={data.entryLimit}
          fees={data.fees}
          trialsCount={data.trials.length}
          timezone={data.timezone}
          flag={brandColors.flag}
        />
        <JudgesSection
          judges={data.judges}
          trialsCount={data.trials.length}
          flag={brandColors.flag}
        />
        <RosterSection
          entryCount={data.entryCount}
          entryLimit={data.entryLimit}
          flag={brandColors.flag}
          flagBright={brandColors.flagBright}
        />
        <PlanSection accommodations={data.accommodations} flag={brandColors.flag} />
        <OnTheDaySection
          items={data.onTheDay}
          hospitalityNotes={data.hospitalityNotes}
          flag={brandColors.flag}
        />
        <OfficersSection
          officers={data.officers}
          secretaryName={data.secretaryName}
          secretaryEmail={data.secretaryEmail}
          flag={brandColors.flag}
        />
        <FinalFlagBand
          brandColors={brandColors}
          entryWizardUrl={data.entryWizardUrl}
          entryCloseDate={data.entryCloseDate}
          timezone={data.timezone}
        />
      </main>

      <BannerFooter
        clubName={data.clubName}
        memberClubLanguage={data.memberClubLanguage}
        licenseLanguage={data.licenseLanguage}
        venueAddress={data.venueAddress}
      />
    </div>
  );
}
