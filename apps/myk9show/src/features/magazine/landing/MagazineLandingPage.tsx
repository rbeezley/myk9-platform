import { useEffect, useMemo } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { ensureMagazineFontsLoaded } from '../fonts';
import { useMagazineLandingData } from './useMagazineLandingData';
import { StickyNav } from './sections/StickyNav';
import { HeroSpread } from './sections/HeroSpread';
import { IssueStrip } from './sections/IssueStrip';
import { WelcomeSection } from './sections/WelcomeSection';
import { JudgesSection } from './sections/JudgesSection';
import { ParticularsSection } from './sections/ParticularsSection';
import { RosterSection } from './sections/RosterSection';
import { PlanSection } from './sections/PlanSection';
import { OnTheDaySection } from './sections/OnTheDaySection';
import { OfficersSection } from './sections/OfficersSection';
import { FinalEditorialBand } from './sections/FinalEditorialBand';
import { MagazineFooter } from './sections/MagazineFooter';
import '../magazine.css';

interface MagazineLandingPageProps {
  show: Show | null | undefined;
  trial: Trial | null | undefined;
  allTrials: Trial[];
}

/**
 * Magazine-style public trial landing page. Mounts when
 * `getShowLandingStyle(show) === 'magazine'`.
 *
 * The `data-magazine` root attribute scopes every `.mz-*` rule in
 * `magazine.css`, so adding this import to a non-Magazine surface is a
 * no-op visually.
 *
 * SEO/OG meta is rendered via React 19's native `<title>` / `<meta>` head
 * tag hoisting — matches the Heritage / Banner pattern.
 */
export function MagazineLandingPage({ show, trial, allTrials }: MagazineLandingPageProps) {
  useEffect(() => {
    ensureMagazineFontsLoaded();
  }, []);

  const data = useMagazineLandingData(show, trial, allTrials);

  const editionLabel = useMemo(() => {
    const year = data.trialStartDate
      ? new Date(data.trialStartDate).getFullYear()
      : new Date().getFullYear();
    return `Edition · ${year}`;
  }, [data.trialStartDate]);

  return (
    <div
      data-magazine
      className="min-h-screen"
      style={{ background: 'var(--mz-paper)', color: 'var(--mz-ink)' }}
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
      <meta
        property="og:url"
        content={typeof window !== 'undefined' ? window.location.href : ''}
      />
      <meta name="twitter:card" content="summary_large_image" />
      {data.coverImageUrl && <meta property="og:image" content={data.coverImageUrl} />}

      <StickyNav
        clubName={data.clubName}
        editionLabel={editionLabel}
        entryWizardUrl={data.entryWizardUrl}
      />

      <main>
        <HeroSpread
          clubName={data.clubName}
          showName={data.showName}
          showSubtitle={data.showSubtitle}
          trialStartDate={data.trialStartDate}
          trialEndDate={data.trialEndDate}
          venueCity={data.venueCity}
          venueName={data.venueName}
          timezone={data.timezone}
          coverImageUrl={data.coverImageUrl}
          coverCaption={data.coverCaption}
          monogramLetters={data.monogramLetters}
          trialChairName={data.trialChairName}
        />

        <IssueStrip
          trialStartDate={data.trialStartDate}
          trialEndDate={data.trialEndDate}
          entryCloseDate={data.entryCloseDate}
          entryLimit={data.entryLimit}
          licenseLanguage={data.licenseLanguage}
          timezone={data.timezone}
        />

        <WelcomeSection
          welcomeText={data.welcomeText}
          trialChairName={data.trialChairName}
          pullQuote={data.pullQuote}
          pullQuoteAttribution={data.pullQuoteAttribution}
        />

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

        <FinalEditorialBand
          entryWizardUrl={data.entryWizardUrl}
          entryCloseDate={data.entryCloseDate}
          timezone={data.timezone}
        />
      </main>

      <MagazineFooter
        clubName={data.clubName}
        memberClubLanguage={data.memberClubLanguage}
        secretaryName={data.secretaryName}
        secretaryEmail={data.secretaryEmail}
        editionLabel={editionLabel}
      />
    </div>
  );
}
