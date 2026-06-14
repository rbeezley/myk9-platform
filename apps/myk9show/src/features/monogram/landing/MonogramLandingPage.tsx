import { useEffect } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { ensureMonogramFontsLoaded } from '../fonts';
import { useMonogramLandingData } from './useMonogramLandingData';
import { StickyNav } from './sections/StickyNav';
import { HeroBlock } from './sections/HeroBlock';
import { WelcomeSection } from './sections/WelcomeSection';
import { ParticularsSection } from './sections/ParticularsSection';
import { JudgesSection } from './sections/JudgesSection';
import { RosterSection } from './sections/RosterSection';
import { PlanSection } from './sections/PlanSection';
import { OfficersSection } from './sections/OfficersSection';
import { FinalCtaBand } from './sections/FinalCtaBand';
import { MonogramFooter } from './sections/MonogramFooter';
import '../monogram.css';

interface MonogramLandingPageProps {
  show: Show | null | undefined;
  trial: Trial | null | undefined;
  allTrials: Trial[];
  hasEntryClassInventory?: boolean | null;
}

/**
 * Monogram-style public trial landing page. Renders when
 * `getShowStyle(show) === 'monogram'` (or `'banner'` until Banner ships its
 * own landing — Banner uses Monogram as the closest visual fallback).
 *
 * Props match HeritageLandingPage so the dispatch in ShowDetailsPage stays
 * a uniform 3-way branch.
 *
 * The `data-monogram` attribute scopes all `.mg-*` rules from monogram.css.
 */
export function MonogramLandingPage({
  show,
  trial,
  allTrials,
  hasEntryClassInventory,
}: MonogramLandingPageProps) {
  useEffect(() => {
    ensureMonogramFontsLoaded();
  }, []);

  const data = useMonogramLandingData(show, trial, allTrials);
  const canEnterOnline = hasEntryClassInventory !== false;

  return (
    <div
      data-monogram
      className="min-h-screen"
      style={{ background: 'var(--mg-paper, #f3eee4)', color: 'var(--mg-ink, #1c1815)' }}
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

      <StickyNav
        clubName={data.clubName}
        monogramLetters={data.monogramLetters}
        entryWizardUrl={data.entryWizardUrl}
        canEnterOnline={canEnterOnline}
      />

      <main>
        <HeroBlock
          monogramLetters={data.monogramLetters}
          showName={data.showName}
          showSubtitle={data.showSubtitle}
          trialStartDate={data.trialStartDate}
          trialEndDate={data.trialEndDate}
          entryCloseDate={data.entryCloseDate}
          entryLimit={data.entryLimit}
          venueName={data.venueName}
          venueCity={data.venueCity}
          timezone={data.timezone}
          entryWizardUrl={data.entryWizardUrl}
          canEnterOnline={canEnterOnline}
        />

        <WelcomeSection
          welcomeText={data.welcomeText}
          trialChairName={data.trialChairName}
          monogramLetters={data.monogramLetters}
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
        />

        <JudgesSection judges={data.judges} trialsCount={data.trials.length} />

        <RosterSection entryCount={data.entryCount} entryLimit={data.entryLimit} />

        <PlanSection
          accommodations={data.accommodations}
          hospitalityNotes={data.hospitalityNotes}
        />

        <OfficersSection
          officers={data.officers}
          secretaryName={data.secretaryName}
          secretaryEmail={data.secretaryEmail}
        />

        <FinalCtaBand
          monogramLetters={data.monogramLetters}
          entryWizardUrl={data.entryWizardUrl}
          entryCloseDate={data.entryCloseDate}
          timezone={data.timezone}
          canEnterOnline={canEnterOnline}
        />
      </main>

      <MonogramFooter
        monogramLetters={data.monogramLetters}
        clubName={data.clubName}
        memberClubLanguage={data.memberClubLanguage}
        licenseLanguage={data.licenseLanguage}
        venueAddress={data.venueAddress}
      />
    </div>
  );
}
