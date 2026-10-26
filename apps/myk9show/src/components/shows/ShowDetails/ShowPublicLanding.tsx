import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { getShowStyle } from '@/features/registries';
import { STYLED_LANDING_BY_STYLE } from '@/features/_shared/styledLandingRegistry';
import type { ShowStyle } from '@/features/registries';
import { useEntitlement } from '@/features/entitlement/useEntitlement';
import { PremiumStyleSelector } from '@/components/panels/edit/PremiumStyleSelector';
import { PREMIUM_STYLE_LABELS } from '@/types/premium-types';
import { Button } from '@/components/ui/button';
import {
  ShowStyleEntitlementError,
  ShowStyleSaveError,
} from '@/features/premium/showStylePersistence';
import { StaleShowNotice } from './StaleShowNotice';
import { MailInEntryNotice } from './MailInEntryNotice';
import { acceptsOnlineEntries, isMailInOnlyShow } from '@/features/payments/onlineEntryGate';
import { LandingMailInContext } from '@/features/_shared/landing/landingMailIn';
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
  /** True when the entry window has not opened yet, or was never set (MYK9-649). */
  entryWindowNotOpen: boolean;
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
  entryWindowNotOpen,
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
  const mailInOnly = isMailInOnlyShow(show);
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
  const [entitlementError, setEntitlementError] = useState(false);
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
    setEntitlementError(false);
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

  const handleSaveStyle = async (style: ShowStyle) => {
    if (!onSaveDraftStyle || isSaving) return;
    setIsSaving(true);
    setSaveError(false);
    setSaveErrorMessage(null);
    setEntitlementError(false);
    try {
      await onSaveDraftStyle(style);
      setCommittedStyle(style);
      setPendingStyle(null);
    } catch (error) {
      setPendingStyle(null);
      if (error instanceof ShowStyleEntitlementError) {
        setEntitlementError(true);
        return;
      }
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
          entitlementError={entitlementError}
          isSaving={isSaving}
          isOnline={isOnline}
          onSelect={style => {
            setPendingStyle(style === committedStyle ? null : style);
            setSaveError(false);
            setSaveErrorMessage(null);
            setEntitlementError(false);
          }}
          onCancel={() => {
            setPendingStyle(null);
            setSaveError(false);
            setSaveErrorMessage(null);
            setEntitlementError(false);
          }}
          onSave={style => void handleSaveStyle(style)}
          onEntitlementBlocked={() => {
            setPendingStyle(null);
            setEntitlementError(true);
          }}
        />
      )}
      {showResults && <ShowResultsSection released={showResults.released} />}
      {refreshFailed && onRetry && <StaleShowNotice onRetry={onRetry} />}
      {mailInOnly && <MailInEntryNotice />}
      <LateEntryContactContext.Provider value={lateEntryContact}>
        <ShowHasHappenedContext.Provider value={hasShowHappened(previewShow)}>
          <LandingMailInContext.Provider value={mailInOnly}>
            {/* MYK9-979: a mail-in show withholds the Enter CTA through the gate
            every style already reads; the context swaps the sections'
            "classes not assigned yet" copy for the mail-in note. */}
            <StyledLanding
              show={previewShow}
              trial={landingTrials[0] ?? null}
              allTrials={landingTrials}
              hasEntryClassInventory={hasEntryClassInventory}
              entryWindowNotOpen={entryWindowNotOpen || !onlineEntriesOpen}
            />
          </LandingMailInContext.Provider>
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
  entitlementError: boolean;
  isSaving: boolean;
  isOnline: boolean;
  onSelect: (style: ShowStyle) => void;
  onCancel: () => void;
  onSave: (style: ShowStyle) => void;
  onEntitlementBlocked: () => void;
}

function PremiumStylePreviewControls({
  committedStyle,
  publishedStyle,
  previewStyle,
  pendingStyle,
  saveError,
  saveErrorMessage,
  entitlementError,
  isSaving,
  isOnline,
  onSelect,
  onCancel,
  onSave,
  onEntitlementBlocked,
}: PremiumStylePreviewControlsProps) {
  const { canAuthorizePremium, isLoading: entitlementLoading } = useEntitlement();

  const handleSave = () => {
    if (!pendingStyle || isSaving) return;
    if (pendingStyle !== 'monogram' && !canAuthorizePremium) {
      onEntitlementBlocked();
      return;
    }
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
        {...(!canAuthorizePremium ? { availableStyles: ['monogram'] as const } : {})}
        onSelect={onSelect}
        disabled={isSaving}
        ariaLabel="Premium presentation style options"
      />
      {entitlementLoading && (
        <p className="mt-2 text-xs text-muted-foreground">Checking Premium style access…</p>
      )}
      {!entitlementLoading && !canAuthorizePremium && (
        <p className="mt-2 text-xs text-muted-foreground">
          Premium styles beyond Monogram require an active Premium entitlement.
        </p>
      )}
      {!isOnline && (
        <p className="mt-3 text-sm text-muted-foreground">
          Reconnect to save this style. Style changes are not stored offline.
        </p>
      )}
      {(saveError || entitlementError) && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {entitlementError
            ? `Premium access is no longer available. Your current style is still ${PREMIUM_STYLE_LABELS[committedStyle]}.`
            : (saveErrorMessage ??
              'Could not confirm whether style saved. Sync and reload before retrying.')}
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
