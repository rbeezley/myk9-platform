import type { EntryPendingReason } from '@/utils/entryStatusUtils';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { getShowStyle, getTrialTimezone } from '@/features/registries';
import { isCountdownTargetClosed } from '@/features/_shared/hooks/useCountdown';
import { STYLED_LANDING_BY_STYLE } from '@/features/_shared/styledLandingRegistry';
import type { ShowStyle } from '@/features/registries';
import { PremiumStyleSelector } from '@/components/panels/edit/PremiumStyleSelector';
import { PREMIUM_STYLE_LABELS } from '@/types/premium-types';
import { Button } from '@/components/ui/button';
import { ShowStyleSaveError } from '@/features/premium/showStylePersistence';
import { StaleShowNotice } from './StaleShowNotice';
import { ServiceFeeNote, useServiceFeeLabel } from '@/features/payments/ServiceFeeNote';
import { acceptsOnlineEntries } from '@/features/payments/onlineEntryGate';
import {
  cardEntriesLanding,
  useShowCardEntriesPaused,
} from '@/features/payments/useShowCardEntriesPaused';
import { PendingEntryCopyProvider } from '@/features/_shared/landing/PendingEntryCopyContext';
import { pendingEntryCopy } from '@/features/_shared/landing/pendingEntryCopy';
import { ShowResultsSection } from '@/features/_shared/landing/ShowResultsSection';
import { buildShowResults, hasShowHappened } from '@/features/_shared/landing/showResults';
import {
  LateEntryContactContext,
  ShowHasHappenedContext,
  pickLateEntryContact,
} from '@/features/_shared/landing/lateEntryContactContext';
import { useShowOfficials } from '@/hooks/queries/useShowOfficials';
import { PreviewExitBar } from './PreviewExitBar';
import { AllShowsBar, useScrollToTopOnShow } from './ShowPublicLanding.frame';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import type { ClassInfo } from '@/components/shows/tabs/ClassesTab';

export interface ShowPublicLandingProps {
  /** The resolved show (already narrowed non-null by the page). */
  show: Show;
  /** Trials for the landing — store rows when warm, anon public rows when cold. */
  landingTrials: Trial[];
  /** Anonymous-safe class identity rows for the shared public preview. */
  offeredClasses?: ClassInfo[];
  /**
   * The class list the results block reads: the warm store's rows when the replica holds the
   * show, else the public read. Separate from `offeredClasses` so a signed-in exhibitor whose
   * replica is warm still sees released results. Defaults to `offeredClasses`.
   */
  resultClasses?: ClassInfo[];
  /**
   * Whether the show's offered classes are known yet. `null` while unresolved;
   * the styled landing uses it to gate its "find your class" affordances. The
   * page always resolves this to `boolean | null` before rendering the landing,
   * so it is required (no `undefined`) to keep the null-means-unresolved contract
   * explicit.
   */
  hasEntryClassInventory: boolean | null;
  /** Why entries are not open yet (MYK9-649), from `entryPendingReasonFor(status)`. */
  entryPendingReason: EntryPendingReason | undefined;
  /** True when a cached show is being shown because the refresh failed. */
  refreshFailed?: boolean | undefined;
  onRetry?: (() => void) | undefined;
  /** Which persisted experience should drive this landing. */
  styleMode?: 'public' | 'manager-draft-preview';
  /** Persists the manager's draft style; published style is unchanged here. */
  onSaveDraftStyle?: (style: ShowStyle) => Promise<void>;
}

/**
 * The public / anonymous marketing landing for a show.
 *
 * Renders the styled landing page that matches the show's (published) style.
 * Audience gating — *whether* a visitor sees this vs. the exhibitor tabs or the
 * management shell — is the page's job; this component owns only the styled
 * landing render once that decision is made.
 */
export function ShowPublicLanding({
  show,
  landingTrials,
  offeredClasses = [],
  resultClasses,
  hasEntryClassInventory,
  entryPendingReason,
  refreshFailed,
  onRetry,
  styleMode = 'public',
  onSaveDraftStyle,
}: ShowPublicLandingProps) {
  useScrollToTopOnShow(show.id);
  useDocumentTitle(`${show.name} | myK9Show`);
  const draftStyle = getShowStyle(show);
  const publishedStyle =
    show.experienceIsPublished && show.experiencePublishedStyle
      ? getShowStyle({ style: show.experiencePublishedStyle })
      : null;
  const isManagerDraftPreview = styleMode === 'manager-draft-preview';
  // A failed or pending officials read leaves the contact null: the page says the club
  // has not listed a secretary rather than breaking.
  const officialsQuery = useShowOfficials(show.id);
  const lateEntryContact = useMemo(
    () => (officialsQuery.isSuccess ? pickLateEntryContact(officialsQuery.data) : undefined),
    [officialsQuery.data, officialsQuery.isSuccess]
  );
  const showResults = buildShowResults(show, resultClasses ?? offeredClasses);
  // Unknown (a stale cached row) is never online-capable: no Enter CTA until known.
  const onlineEntriesOpen = acceptsOnlineEntries(show);
  const showServiceFee = useServiceFeeLabel(show) !== null;
  // MYK9-2192: the server's answer on card entries (anon-readable), so this page and the
  // checkout refusal cannot disagree. Enter waits for it; it never reads loading as open.
  // Asked whenever every other input of the styled landing's Enter decision
  // (inventory !== false && !entryClosed && !entryPendingReason) would offer Enter. The close
  // part is left to the landing's own countdown: the ask is not skipped on a close this page
  // works out separately, so no clock or zone mismatch can offer Enter without an answer.
  const cardState = useShowCardEntriesPaused(
    show,
    entryPendingReason === undefined && onlineEntriesOpen && hasEntryClassInventory !== false
  );
  const cardLanding = cardEntriesLanding(cardState, show);
  // An online fee beside "card payments are paused" contradicts it; say the fee only while card is not paused.
  const showServiceFeeNote = showServiceFee && cardState !== 'paused';
  const trialTimezone = getTrialTimezone(landingTrials[0] ?? null);
  // The pay-by-check line only while entries are open. Read at render, with no timer of its
  // own: the landing's countdown already ticks, and a note outliving the close by a few minutes
  // offers nothing the closed Enter does not.
  const cardNote = isCountdownTargetClosed(
    landingTrials[0]?.entryCloseDate ?? show.entryCloseDate ?? null,
    trialTimezone
  )
    ? null
    : cardLanding.note;

  // Public visitors render the last published experience. Managers in Preview
  // intentionally render the current draft instead; changing the draft must
  // not make the public URL look ahead of its published snapshot.
  const publicLandingShow = useMemo(
    () => ({ ...show, style: publishedStyle ?? draftStyle }),
    [draftStyle, publishedStyle, show]
  );
  const persistedPreviewStyle = isManagerDraftPreview ? draftStyle : (publishedStyle ?? draftStyle);
  const styleEditorEnabled = isManagerDraftPreview && onSaveDraftStyle !== undefined;
  const [committedStyle, setCommittedStyle] = useState<ShowStyle>(persistedPreviewStyle);
  const [pendingStyle, setPendingStyle] = useState<ShowStyle | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isOnline = useSyncExternalStore(
    listener => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => true
  );

  useEffect(() => {
    setCommittedStyle(persistedPreviewStyle);
    setPendingStyle(null);
    setSaveError(false);
    setSaveErrorMessage(null);
  }, [persistedPreviewStyle, show.id, styleEditorEnabled]);

  const previewStyle = styleEditorEnabled
    ? (pendingStyle ?? committedStyle)
    : persistedPreviewStyle;
  const previewLandingShow = useMemo(
    () => ({ ...publicLandingShow, style: previewStyle }),
    [previewStyle, publicLandingShow]
  );

  const previewShow = useMemo(() => {
    if (offeredClasses.length === 0) return previewLandingShow;

    const offeredClassesByTrial = new Map<string, ClassInfo[]>();
    for (const classInfo of offeredClasses) {
      const classes = offeredClassesByTrial.get(classInfo.trialId) ?? [];
      classes.push(classInfo);
      offeredClassesByTrial.set(classInfo.trialId, classes);
    }

    return {
      ...previewLandingShow,
      trials: landingTrials.map(trial => ({
        id: trial.id,
        name: trial.name || trial.trialNumber || 'Trial',
        date: trial.trialDate || '',
        trialNumber: trial.trialNumber || '',
        status: trial.status || '',
        classes: (offeredClassesByTrial.get(trial.id) ?? []).map(classInfo => ({
          id: classInfo.id,
          name: classInfo.name,
          element: classInfo.element,
          level: classInfo.level,
          section: classInfo.section,
        })),
      })),
    };
  }, [landingTrials, offeredClasses, previewLandingShow]);

  // INTENT: null/default style uses the product's committed Monogram default
  // for public visitors. That keeps the shareable show URL on a brand landing
  // without adding another default surface; management users still get the
  // tabbed product UI where show operations live unless a manager explicitly
  // opens the public preview, which composes the style editor here.
  const publicShowStyle = getShowStyle(previewLandingShow);
  // The registry is exhaustive over every ShowStyle value (typecheck
  // enforces it), and getShowStyle() falls back to the committed
  // Monogram default for null/default/unknown values.
  const StyledLanding = STYLED_LANDING_BY_STYLE[publicShowStyle];

  // Built once here, not per style page: a style's countdown re-renders every second, and the
  // copy (a date formatted in the trial's zone) only changes with these inputs.
  const effectivePendingReason =
    entryPendingReason ??
    (onlineEntriesOpen ? cardLanding.pendingReason : 'online_setting_unknown');
  // The copy follows `entryPendingReason`, which the page re-derives when the opening
  // boundary passes (useEntryOpenBoundaryTick), so the copy, the reason and the Enter action
  // change together.
  const pendingCopy = useMemo(
    () =>
      pendingEntryCopy({
        hasEntryClassInventory,
        entryPendingReason: effectivePendingReason,
        entryOpenDate: show.entryOpenDate,
        timezone: trialTimezone,
      }),
    [hasEntryClassInventory, effectivePendingReason, show.entryOpenDate, trialTimezone]
  );

  const handleSaveStyle = async (style: ShowStyle) => {
    if (!onSaveDraftStyle || isSaving) return;
    setIsSaving(true);
    setSaveError(false);
    setSaveErrorMessage(null);
    try {
      await onSaveDraftStyle(style);
      setCommittedStyle(style);
      setPendingStyle(null);
    } catch (error) {
      setPendingStyle(null);
      setSaveError(true);
      setSaveErrorMessage(error instanceof ShowStyleSaveError ? error.message : null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {isManagerDraftPreview && <PreviewExitBar showId={show.id} />}
      {!isManagerDraftPreview && <AllShowsBar />}
      {styleEditorEnabled && (
        <PremiumStylePreviewControls
          committedStyle={committedStyle}
          publishedStyle={publishedStyle}
          previewStyle={previewStyle}
          pendingStyle={pendingStyle}
          saveError={saveError}
          saveErrorMessage={saveErrorMessage}
          isSaving={isSaving}
          isOnline={isOnline}
          onSelect={style => {
            setPendingStyle(style === committedStyle ? null : style);
            setSaveError(false);
            setSaveErrorMessage(null);
          }}
          onCancel={() => {
            setPendingStyle(null);
            setSaveError(false);
            setSaveErrorMessage(null);
          }}
          onSave={style => void handleSaveStyle(style)}
        />
      )}
      {showResults && <ShowResultsSection released={showResults.released} />}
      {refreshFailed && onRetry && <StaleShowNotice onRetry={onRetry} />}
      {/* MYK9-1963: the card service fee is said before the wizard, not first
          met on its third step. Every landing style prints its own fee rows,
          so the one line lives here, above all of them, and only where an
          exhibitor could still enter online and the live rate is read. */}
      {showServiceFeeNote && (
        <div
          className="border-b border-border bg-muted px-4 py-3 text-sm text-foreground sm:px-6"
          role="note"
          aria-label="Service fee"
        >
          <ServiceFeeNote show={show} />
        </div>
      )}
      {cardNote && (
        <div
          className="border-b border-border bg-muted px-4 py-3 text-sm text-foreground sm:px-6"
          role="note"
          aria-label="Card payments paused"
        >
          {cardNote}
        </div>
      )}
      <LateEntryContactContext.Provider value={lateEntryContact}>
        <ShowHasHappenedContext.Provider value={hasShowHappened(previewShow)}>
          <PendingEntryCopyProvider value={pendingCopy}>
            <StyledLanding
              show={previewShow}
              trial={landingTrials[0] ?? null}
              allTrials={landingTrials}
              hasEntryClassInventory={hasEntryClassInventory}
              entryPendingReason={effectivePendingReason}
            />
          </PendingEntryCopyProvider>
        </ShowHasHappenedContext.Provider>
      </LateEntryContactContext.Provider>
    </>
  );
}

interface PremiumStylePreviewControlsProps {
  committedStyle: ShowStyle;
  publishedStyle: ShowStyle | null;
  previewStyle: ShowStyle;
  pendingStyle: ShowStyle | null;
  saveError: boolean;
  saveErrorMessage: string | null;
  isSaving: boolean;
  isOnline: boolean;
  onSelect: (style: ShowStyle) => void;
  onCancel: () => void;
  onSave: (style: ShowStyle) => void;
}

function PremiumStylePreviewControls({
  committedStyle,
  publishedStyle,
  previewStyle,
  pendingStyle,
  saveError,
  saveErrorMessage,
  isSaving,
  isOnline,
  onSelect,
  onCancel,
  onSave,
}: PremiumStylePreviewControlsProps) {
  const handleSave = () => {
    if (!pendingStyle || isSaving) return;
    onSave(pendingStyle);
  };

  return (
    <section
      aria-label="Premium presentation style"
      className="mx-auto mb-6 w-full max-w-5xl rounded-lg border bg-card p-4 shadow-sm"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Premium presentation style</h2>
          <p className="text-sm text-muted-foreground">Choose how exhibitors will see this show.</p>
        </div>
        <div className="text-sm text-muted-foreground">
          <span>
            {publishedStyle ? 'Draft' : 'Current'}: {PREMIUM_STYLE_LABELS[committedStyle]}
          </span>
          {publishedStyle && (
            <span className="ml-3">Published: {PREMIUM_STYLE_LABELS[publishedStyle]}</span>
          )}
          {pendingStyle && (
            <span className="ml-3 font-medium text-foreground">
              Pending: {PREMIUM_STYLE_LABELS[pendingStyle]}
            </span>
          )}
        </div>
      </div>
      <PremiumStyleSelector
        selectedStyle={previewStyle}
        onSelect={onSelect}
        disabled={isSaving}
        ariaLabel="Premium presentation style options"
      />
      {!isOnline && (
        <p className="mt-3 text-sm text-muted-foreground">
          Reconnect to save this style. Style changes are not stored offline.
        </p>
      )}
      {saveError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {saveErrorMessage ??
            'We could not confirm whether the style was saved. Restart the app before trying again.'}
        </p>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={!pendingStyle || isSaving}
          onClick={onCancel}
        >
          Cancel style
        </Button>
        <Button
          type="button"
          size="touch"
          disabled={!pendingStyle || isSaving || !isOnline}
          onClick={handleSave}
        >
          {isSaving ? 'Saving…' : 'Save style'}
        </Button>
      </div>
    </section>
  );
}
