import { useEffect } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { ensurePosterFontsLoaded } from '../fonts';
import { posterColors } from '../tokens';
import { usePosterLandingData } from './usePosterLandingData';
import { StickyNav } from './sections/StickyNav';
import { HeroBlock } from './sections/HeroBlock';
import { WelcomeSection } from './sections/WelcomeSection';
import { ParticularsSection } from './sections/ParticularsSection';
import { JudgesSection } from './sections/JudgesSection';
import { RosterSection } from './sections/RosterSection';
import { OnTheDaySection } from './sections/OnTheDaySection';
import { PlanSection } from './sections/PlanSection';
import { OfficersSection } from './sections/OfficersSection';
import { FinalCtaSection } from './sections/FinalCtaSection';
import { PosterFooter } from './sections/PosterFooter';
import '../poster.css';

interface PosterLandingPageProps {
  show: Show | null | undefined;
  trial: Trial | null | undefined;
  allTrials: Trial[];
}

/**
 * Poster-style public trial landing page. Renders when
 * `getShowLandingStyle(show) === 'poster'`.
 *
 * The Poster identity has no per-club brand-color override — its palette
 * is fixed at the design-system level (cream / ink / red / olive). All
 * customization happens via show data (name, dates, fees, judges).
 *
 * Section order:
 *   StickyNav (top mono strip)
 *   Hero
 *   01 Welcome
 *   02 Particulars
 *   04 Judges
 *   05 Roster
 *   06 On the day (olive band)
 *   07 Plan
 *   08 Committee
 *   09 Final CTA
 *   Footer
 *
 * Section №3 (Fees dark band) was inlined into Particulars to keep the
 * fee data flow simple — see ParticularsSection's red highlight chips.
 */
export function PosterLandingPage({ show, trial, allTrials }: PosterLandingPageProps) {
  useEffect(() => {
    ensurePosterFontsLoaded();
  }, []);

  const data = usePosterLandingData(show, trial, allTrials);

  // Build the show abbreviation from the first letters of words, e.g.
  // "Spring Scent Work" → "SSW". Falls back to first 4 chars if too short.
  const abbreviation = (() => {
    const tokens = data.showName.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      return tokens
        .slice(0, 4)
        .map(t => t[0]!.toUpperCase())
        .join('');
    }
    return data.showName.slice(0, 4).toUpperCase();
  })();

  // Build a license label for the masthead — fall back to license language.
  const trialYear = data.trialStartDate
    ? new Date(data.trialStartDate).getFullYear()
    : null;
  const licenseLabel = trialYear ? `AKC LICENSE №\n${trialYear}—${(show?.id ?? '').slice(0, 4).toUpperCase()}` : null;

  return (
    <div data-poster style={{ background: posterColors.cream, color: posterColors.ink }}>
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
        showAbbreviation={abbreviation}
        trialStartDate={data.trialStartDate}
        trialEndDate={data.trialEndDate}
        timezone={data.timezone}
        venueName={data.venueName}
        venueCity={data.venueCity}
        entryCount={data.entryCount}
        entryLimit={data.entryLimit}
        entryWizardUrl={data.entryWizardUrl}
      />

      <HeroBlock
        clubName={data.clubName}
        showName={data.showName}
        showSubtitle={data.showSubtitle}
        trialStartDate={data.trialStartDate}
        entryCloseDate={data.entryCloseDate}
        entryLimit={data.entryLimit}
        venueName={data.venueName}
        timezone={data.timezone}
        licenseLabel={licenseLabel}
      />

      <main>
        <WelcomeSection
          welcomeText={data.welcomeText}
          trialChairName={data.trialChairName}
        />
        <ParticularsSection
          licenseLanguage={data.licenseLanguage}
          entryOpenDate={data.entryOpenDate}
          entryCloseDate={data.entryCloseDate}
          confirmationDate={data.confirmationDate}
          entryLimit={data.entryLimit}
          trialsCount={data.trials.length}
          timezone={data.timezone}
        />
        <JudgesSection judges={data.judges} trialsCount={data.trials.length} />
        <RosterSection
          entryCount={data.entryCount}
          entryLimit={data.entryLimit}
        />
        <OnTheDaySection
          items={data.onTheDay}
          hospitalityNotes={data.hospitalityNotes}
        />
        <PlanSection accommodations={data.accommodations} />
        <OfficersSection
          officers={data.officers}
          secretaryName={data.secretaryName}
          secretaryEmail={data.secretaryEmail}
        />
        <FinalCtaSection
          entryWizardUrl={data.entryWizardUrl}
          entryCloseDate={data.entryCloseDate}
          timezone={data.timezone}
        />
      </main>

      <PosterFooter
        clubName={data.clubName}
        memberClubLanguage={data.memberClubLanguage}
        licenseLanguage={data.licenseLanguage}
        venueAddress={data.venueAddress}
        secretaryName={data.secretaryName}
        secretaryEmail={data.secretaryEmail}
      />
    </div>
  );
}
