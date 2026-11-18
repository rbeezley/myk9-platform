import { PendingEntryCopyProvider } from '@/features/_shared/landing/PendingEntryCopyContext';
import type { EntryPendingReason } from '@/utils/entryStatusUtils';
import { pendingEntryCopy } from '@/features/_shared/landing/pendingEntryCopy';
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
import { ensureGazetteFontsLoaded } from '../fonts';
import { StickyEntryCtaBar } from '@/features/_shared/landing/StickyEntryCtaBar';
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
  hasEntryClassInventory?: boolean | null;
  /** True when the entry window has not opened yet. */
  entryPendingReason?: EntryPendingReason | undefined;
}

/**
 * Gazette-style public show landing page. ShowDetailsPage dispatches it through
 * the styled landing registry when `getShowStyle(show) === 'gazette'`.
 *
 * `data-gazette` on the root element scopes all .gz-* CSS rules (gazette.css).
 * Reduced-motion handling lives inside individual sections via the shared
 * Heritage hook.
 */
export function GazetteLandingPage({
  show,
  trial,
  allTrials,
  hasEntryClassInventory,
  entryPendingReason,
}: GazetteLandingPageProps) {
  useEffect(() => {
    ensureGazetteFontsLoaded();
  }, []);

  const data = useGazetteLandingData(show, trial, allTrials);
  const classesHref = publicClassesHref(show);
  const entryCountdown = useCountdown(data.entryCloseDate, data.timezone);
  const entryClosed = entryCountdown.closed;
  // `entryPendingReason` matters as much as closed: a show whose entries open
  // months from now must not advertise an entry CTA that dead-ends.
  const canEnterOnline = hasEntryClassInventory !== false && !entryClosed && !entryPendingReason;

  const editionLabel =
    data.edition != null
      ? `VOL. ${data.volumeRoman} · NO ${data.edition}`
      : `VOL. ${data.volumeRoman}`;

  const pendingCopy = pendingEntryCopy({
    hasEntryClassInventory,
    entryPendingReason,
    entryOpenDate: data.entryOpenDate,
    timezone: data.timezone,
  });

  return (
    <PendingEntryCopyProvider value={pendingCopy}>
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
        <meta
          property="og:url"
          content={typeof window !== 'undefined' ? window.location.href : ''}
        />
        <meta name="twitter:card" content="summary" />

        <StickyNav
          clubName={data.clubName}
          entryWizardUrl={data.entryWizardUrl}
          editionLabel={editionLabel}
          canEnterOnline={canEnterOnline}
          entryClosed={entryClosed}
        />

        <MastheadSection
          clubName={data.clubName}
          showName={data.showName}
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
          <WithdrawalPolicySection
            showId={show?.id}
            className="mx-auto max-w-[1100px] border-b px-6 py-12 md:px-12 md:py-14"
          />
          <RecordingFeeSection
            statement={data.recordingFee}
            className="mx-auto max-w-[1100px] border-b px-6 py-12 md:px-12 md:py-14"
          />
          <ScoutingStatementSection
            statement={data.scoutingStatement}
            className="mx-auto max-w-[1100px] border-b px-6 py-12 md:px-12 md:py-14"
          />
          <PremiumDownloadSection
            show={show}
            className="mx-auto max-w-[1100px] border-b px-6 py-12 md:px-12 md:py-14"
          />

          <JudgesSection judges={data.judges} volumeRoman={data.volumeRoman} />

          <RosterSection
            entryCount={data.entryCount}
            entryLimit={data.entryLimit}
            journeySteps={data.journeySteps}
            timezone={data.timezone}
            volumeRoman={data.volumeRoman}
            pastShow={data.showHasHappened}
          />

          <ScheduleSection schedule={data.schedule} volumeRoman={data.volumeRoman} />

          <ClassifiedsSection
            accommodations={data.accommodations}
            hospitalityNotes={data.hospitalityNotes}
            awardsDescription={data.awardsDescription}
            houseRulesNotes={data.houseRulesNotes}
            volumeRoman={data.volumeRoman}
          />

          <OfficersSection
            officers={data.officers}
            secretaryName={data.secretaryName}
            volumeRoman={data.volumeRoman}
          />

          <OfferedClassesSection
            show={show}
            className="mx-auto max-w-[1100px] border-b px-6 py-12 md:px-12 md:py-14"
          />

          <FinalCtaSection
            classesHref={classesHref}
            entryCloseDate={data.entryCloseDate}
            timezone={data.timezone}
            canEnterOnline={canEnterOnline}
            entryClosed={entryClosed}
          />
        </main>

        <GazetteFooter
          clubName={data.clubName}
          memberClubLanguage={data.memberClubLanguage}
          secretaryName={data.secretaryName}
          secretaryEmail={data.secretaryEmail}
          secretaryPhone={data.secretaryPhone}
        />

        {/* MYK9-633: last child, after the footer — see StickyEntryCtaBar's
          doc comment for why placement matters. */}
        <StickyEntryCtaBar
          entryWizardUrl={data.entryWizardUrl}
          canShowEntryCta={canEnterOnline}
          label="Enter"
          surface={{
            background: 'var(--gz-deep)',
            borderTop: '1px solid var(--gz-paper)',
            buttonBackground: 'var(--gz-paper)',
            buttonColor: 'var(--gz-ink)',
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        />
      </div>
    </PendingEntryCopyProvider>
  );
}
