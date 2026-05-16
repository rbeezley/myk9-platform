import { useEffect } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { ensureFieldGuideFontsLoaded } from '../fonts';
import { useFieldGuideLandingData } from './useFieldGuideLandingData';
import { TopStrip } from './sections/TopStrip';
import { DataGridHero } from './sections/DataGridHero';
import { WelcomeSection } from './sections/WelcomeSection';
import { ParticularsSection } from './sections/ParticularsSection';
import { JudgesSection } from './sections/JudgesSection';
import { RosterSection } from './sections/RosterSection';
import { ScheduleSection } from './sections/ScheduleSection';
import { PlanSection } from './sections/PlanSection';
import { OfficersSection } from './sections/OfficersSection';
import { FinalCtaSection } from './sections/FinalCtaSection';
import { FieldGuideFooter } from './sections/FieldGuideFooter';
import '../fieldGuide.css';

interface FieldGuideLandingPageProps {
  show: Show | null | undefined;
  trial: Trial | null | undefined;
  allTrials: Trial[];
}

/**
 * Field-Guide-style public trial landing page. Renders when
 * `getShowLandingStyle(show) === 'fieldGuide'`.
 *
 * Field Guide is fully fixed (no per-club brand color), so unlike
 * Banner there's no `style` prop carrying a CSS-var bundle — the
 * `[data-field-guide]` scope picks up the palette from `fieldGuide.css`.
 */
export function FieldGuideLandingPage({ show, trial, allTrials }: FieldGuideLandingPageProps) {
  useEffect(() => {
    ensureFieldGuideFontsLoaded();
  }, []);

  const data = useFieldGuideLandingData(show, trial, allTrials);

  return (
    <div data-field-guide className="min-h-screen">
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

      <TopStrip
        showCode={data.showCode}
        licenseLanguage={data.licenseLanguage}
        entryWizardUrl={data.entryWizardUrl}
        entryLimit={data.entryLimit}
      />

      <DataGridHero
        showName={data.showName}
        showSubtitle={data.showSubtitle}
        heroChips={[
          { label: 'OPEN', variant: 'orange' },
          { label: data.licenseLanguage.toUpperCase() },
          {
            label: `${data.trials.length} TRIAL${data.trials.length === 1 ? '' : 'S'}`,
            variant: 'cyan',
          },
        ]}
        description={data.welcomeText}
        cells={data.quickRefCells}
      />

      <main>
        <WelcomeSection
          welcomeText={data.welcomeText}
          trialChairName={data.trialChairName}
          trialChairEmail={data.trialChairEmail}
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
          entryOpenDate={data.entryOpenDate}
          entryCloseDate={data.entryCloseDate}
          timezone={data.timezone}
        />
        <ScheduleSection items={data.onTheDay} hospitalityNotes={data.hospitalityNotes} />
        <PlanSection accommodations={data.accommodations} />
        <OfficersSection
          officers={data.officers}
          secretaryName={data.secretaryName}
          secretaryEmail={data.secretaryEmail}
        />
      </main>

      <FinalCtaSection
        entryWizardUrl={data.entryWizardUrl}
        entryCloseDate={data.entryCloseDate}
        timezone={data.timezone}
        entryLimit={data.entryLimit}
      />

      <FieldGuideFooter
        showCode={data.showCode}
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
