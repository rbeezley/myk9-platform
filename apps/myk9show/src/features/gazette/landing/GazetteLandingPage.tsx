import { useEffect } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { ensureGazetteFontsLoaded } from '../fonts';
import { useGazetteLandingData } from './useGazetteLandingData';
import { StickyNav } from './sections/StickyNav';
import { MastheadSection } from './sections/MastheadSection';
import { LeadArticleSection } from './sections/LeadArticleSection';
import { ParticularsSection } from './sections/ParticularsSection';
import { JudgesSection } from './sections/JudgesSection';
import { RosterSection } from './sections/RosterSection';
import { ScheduleSection } from './sections/ScheduleSection';
import { ClassifiedsSection } from './sections/ClassifiedsSection';
import { OfficersSection } from './sections/OfficersSection';
import { FinalCtaSection } from './sections/FinalCtaSection';
import { GazetteFooter } from './sections/GazetteFooter';
import '../gazette.css';

interface GazetteLandingPageProps {
  show: Show | null | undefined;
  trial: Trial | null | undefined;
  allTrials: Trial[];
}

/**
 * Gazette-style public trial landing page. Renders when
 * `show.landing_style === 'gazette'`. Branches in from TrialDetailsPage
 * after loading checks so all hooks fire unconditionally.
 *
 * `data-gazette` on the root element scopes all .gz-* CSS rules (gazette.css).
 * Reduced-motion handling lives inside individual sections via the shared
 * Heritage hook.
 */
export function GazetteLandingPage({ show, trial, allTrials }: GazetteLandingPageProps) {
  useEffect(() => {
    ensureGazetteFontsLoaded();
  }, []);

  const data = useGazetteLandingData(show, trial, allTrials);

  const editionLabel = data.edition != null
    ? `VOL. ${data.volumeRoman} · NO ${data.edition}`
    : `VOL. ${data.volumeRoman}`;

  return (
    <div data-gazette className="min-h-screen">
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
        entryWizardUrl={data.entryWizardUrl}
        editionLabel={editionLabel}
      />

      <MastheadSection
        clubName={data.clubName}
        volumeRoman={data.volumeRoman}
        edition={data.edition}
        motto={data.motto}
        established={data.established}
        cityLabel={data.cityLabel}
        trialStartDate={data.trialStartDate}
        timezone={data.timezone}
      />

      <main>
        <LeadArticleSection
          showName={data.showName}
          showSubtitle={data.showSubtitle}
          welcomeText={data.welcomeText}
          trialChairName={data.trialChairName}
          trialChairTitle={data.trialChairTitle}
          trialStartDate={data.trialStartDate}
          trialEndDate={data.trialEndDate}
          timezone={data.timezone}
        />

        <ParticularsSection
          licenseLanguage={data.licenseLanguage}
          entryOpenDate={data.entryOpenDate}
          entryCloseDate={data.entryCloseDate}
          confirmationDate={data.confirmationDate}
          entryLimit={data.entryLimit}
          fees={data.fees}
          timezone={data.timezone}
          volumeRoman={data.volumeRoman}
        />

        <JudgesSection judges={data.judges} volumeRoman={data.volumeRoman} />

        <RosterSection
          entryCount={data.entryCount}
          entryLimit={data.entryLimit}
          journeySteps={data.journeySteps}
          timezone={data.timezone}
          volumeRoman={data.volumeRoman}
        />

        <ScheduleSection schedule={data.schedule} volumeRoman={data.volumeRoman} />

        <ClassifiedsSection
          accommodations={data.accommodations}
          hospitalityNotes={data.hospitalityNotes}
          awardsDescription={data.awardsDescription}
          volumeRoman={data.volumeRoman}
        />

        <OfficersSection
          officers={data.officers}
          secretaryName={data.secretaryName}
          volumeRoman={data.volumeRoman}
        />

        <FinalCtaSection
          entryWizardUrl={data.entryWizardUrl}
          entryCloseDate={data.entryCloseDate}
          timezone={data.timezone}
        />
      </main>

      <GazetteFooter
        clubName={data.clubName}
        memberClubLanguage={data.memberClubLanguage}
        secretaryName={data.secretaryName}
        secretaryEmail={data.secretaryEmail}
        secretaryPhone={data.secretaryPhone}
      />
    </div>
  );
}
