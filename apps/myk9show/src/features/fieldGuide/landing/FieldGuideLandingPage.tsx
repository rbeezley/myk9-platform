import type { EntryPendingReason } from '@/utils/entryStatusUtils';
import { useEffect } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { publicClassesHref } from '@/features/_shared/publicClassesHref';
import { OfferedClassesSection } from '@/features/_shared/landing/OfferedClassesSection';
import { WithdrawalPolicySection } from '@/features/_shared/landing/WithdrawalPolicySection';
import { RecordingFeeSection } from '@/features/_shared/landing/RecordingFeeSection';
import { ScoutingStatementSection } from '@/features/_shared/landing/ScoutingStatementSection';
import { PremiumDownloadSection } from '@/features/_shared/landing/PremiumDownloadSection';
import { useCountdown } from '@/features/_shared/hooks/useCountdown';
import { ensureFieldGuideFontsLoaded, FIELD_GUIDE_DISPLAY_FAMILY } from '../fonts';
import { useFieldGuideLandingData } from './useFieldGuideLandingData';
import { fieldGuideColors, fieldGuideSpacing } from '../tokens';
import { StickyEntryCtaBar } from '@/features/_shared/landing/StickyEntryCtaBar';
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
  hasEntryClassInventory?: boolean | null;
  /** True when the entry window has not opened yet. */
  entryPendingReason?: EntryPendingReason | undefined;
}

/**
 * Field-Guide-style public trial landing page. Renders when
 * `getShowStyle(show) === 'fieldGuide'`.
 *
 * Field Guide is fully fixed (no per-club brand color), so unlike
 * Banner there's no `style` prop carrying a CSS-var bundle — the
 * `[data-field-guide]` scope picks up the palette from `fieldGuide.css`.
 */
// MYK9-2041: the shared policy and premium sections take the page's column, like
// the sections around them; the class alone sets padding only on narrow screens.
const SHARED_SECTION_STYLE = {
  maxWidth: fieldGuideSpacing.contentMax,
  margin: '0 auto',
  padding: `${fieldGuideSpacing.sectionPaddingY}px ${fieldGuideSpacing.pageGutterX}px`,
} as const;

export function FieldGuideLandingPage({
  show,
  trial,
  allTrials,
  hasEntryClassInventory,
  entryPendingReason,
}: FieldGuideLandingPageProps) {
  useEffect(() => {
    ensureFieldGuideFontsLoaded();
  }, []);

  const data = useFieldGuideLandingData(show, trial, allTrials);
  const classesHref = publicClassesHref(show);
  const entryCountdown = useCountdown(data.entryCloseDate, data.timezone);
  const entryClosed = entryCountdown.closed;
  // `entryPendingReason` matters as much as closed: a show whose entries open
  // months from now must not advertise an entry CTA that dead-ends.
  const canEnterOnline = hasEntryClassInventory !== false && !entryClosed && !entryPendingReason;

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
        canEnterOnline={canEnterOnline}
        entryClosed={entryClosed}
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
          fees={data.fees}
          trialsCount={data.trials.length}
          timezone={data.timezone}
        />
        <WithdrawalPolicySection
          showId={show?.id}
          className="fg-section"
          style={SHARED_SECTION_STYLE}
        />
        <RecordingFeeSection
          statement={data.recordingFee}
          className="fg-section"
          style={SHARED_SECTION_STYLE}
        />
        <ScoutingStatementSection
          statement={data.scoutingStatement}
          className="fg-section"
          style={SHARED_SECTION_STYLE}
        />
        <PremiumDownloadSection show={show} className="fg-section" style={SHARED_SECTION_STYLE} />
        <JudgesSection judges={data.judges} trialsCount={data.trials.length} />
        <RosterSection
          entryCount={data.entryCount}
          entryLimit={data.entryLimit}
          entryOpenDate={data.entryOpenDate}
          entryCloseDate={data.entryCloseDate}
          timezone={data.timezone}
        />
        <ScheduleSection
          items={data.onTheDay}
          hospitalityNotes={data.hospitalityNotes}
          awardsDescription={data.awardsDescription}
          houseRulesNotes={data.houseRulesNotes}
        />
        <PlanSection accommodations={data.accommodations} />
        <OfficersSection
          officers={data.officers}
          secretaryName={data.secretaryName}
          secretaryEmail={data.secretaryEmail}
        />
      </main>

      <OfferedClassesSection show={show} className="fg-section" />

      <FinalCtaSection
        entryWizardUrl={data.entryWizardUrl}
        classesHref={classesHref}
        entryCloseDate={data.entryCloseDate}
        timezone={data.timezone}
        entryLimit={data.entryLimit}
        canEnterOnline={canEnterOnline}
        entryClosed={entryClosed}
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

      {/* MYK9-633: last child, after the footer — see StickyEntryCtaBar's
          doc comment for why placement matters. */}
      <StickyEntryCtaBar
        entryWizardUrl={data.entryWizardUrl}
        canShowEntryCta={canEnterOnline}
        label="ENTER →"
        ariaLabel="Enter show"
        surface={{
          background: fieldGuideColors.ink,
          buttonBackground: fieldGuideColors.orange,
          buttonColor: fieldGuideColors.paper,
          fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      />
    </div>
  );
}
