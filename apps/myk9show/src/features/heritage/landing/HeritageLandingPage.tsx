import { useEffect } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { ensureHeritageFontsLoaded } from '../fonts';
import { useHeritageLandingData } from './useHeritageLandingData';
import { StickyNav } from './sections/StickyNav';
import { HeroBlock } from './sections/HeroBlock';
import { WelcomeSection } from './sections/WelcomeSection';
import { JudgesSection } from './sections/JudgesSection';
import { ParticularsSection } from './sections/ParticularsSection';
import { RosterSection } from './sections/RosterSection';
import { PlanSection } from './sections/PlanSection';
import { OnTheDaySection } from './sections/OnTheDaySection';
import { OfficersSection } from './sections/OfficersSection';
import { FinalCtaBand } from './sections/FinalCtaBand';
import { HeritageFooter } from './sections/HeritageFooter';
import '../heritage.css';

interface HeritageLandingPageProps {
  show: Show | null | undefined;
  trial: Trial | null | undefined;
  allTrials: Trial[];
}

/**
 * Heritage-style public trial landing page. Renders when show.landing_style === 'heritage'.
 * Branches in from TrialDetailsPage after loading checks so all hooks fire unconditionally.
 *
 * data-heritage on the root element scopes all .hl-* CSS rules (heritage.css).
 */
export function HeritageLandingPage({ show, trial, allTrials }: HeritageLandingPageProps) {
  // Lazy-load Heritage fonts on first render — preconnect + <link> injected once.
  useEffect(() => {
    ensureHeritageFontsLoaded();
  }, []);

  const data = useHeritageLandingData(show, trial, allTrials);

  return (
    <div
      data-heritage
      className="min-h-screen"
      style={{ background: 'var(--hl-paper)', color: 'var(--hl-ink)' }}
    >
      {/* React 19 native head tag hoisting — SEO + OG (§13.5) */}
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

      <StickyNav clubName={data.clubName} entryWizardUrl={data.entryWizardUrl} />

      <main>
        <HeroBlock
          clubName={data.clubName}
          showName={data.showName}
          showSubtitle={data.showSubtitle}
          entryCloseDate={data.entryCloseDate}
          trialStartDate={data.trialStartDate}
          trialEndDate={data.trialEndDate}
          venueName={data.venueName}
          venueCity={data.venueCity}
          timezone={data.timezone}
          entryWizardUrl={data.entryWizardUrl}
        />

        <WelcomeSection welcomeText={data.welcomeText} trialChairName={data.trialChairName} />

        <JudgesSection judges={data.judges} />

        <ParticularsSection
          licenseLanguage={data.licenseLanguage}
          entryOpenDate={data.entryOpenDate}
          entryCloseDate={data.entryCloseDate}
          confirmationDate={data.confirmationDate}
          entryLimit={data.entryLimit}
          fees={data.fees}
          timezone={data.timezone}
        />

        <RosterSection
          entryCount={data.entryCount}
          entryLimit={data.entryLimit}
          journeySteps={data.journeySteps}
          timezone={data.timezone}
        />

        <PlanSection
          accommodations={data.accommodations}
          hospitalityNotes={data.hospitalityNotes}
        />

        <OnTheDaySection
          venueName={data.venueName}
          venueAddress={data.venueAddress}
          awardsDescription={data.awardsDescription}
          houseRulesNotes={data.houseRulesNotes}
          hospitalityNotes={data.hospitalityNotes}
        />

        <OfficersSection
          officers={data.officers}
          secretaryName={data.secretaryName}
          secretaryEmail={data.secretaryEmail}
        />

        <FinalCtaBand entryWizardUrl={data.entryWizardUrl} />
      </main>

      <HeritageFooter
        clubName={data.clubName}
        memberClubLanguage={data.memberClubLanguage}
        secretaryName={data.secretaryName}
        secretaryEmail={data.secretaryEmail}
      />
    </div>
  );
}
