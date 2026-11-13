/**
 * AtShowScoresheetPage — Phase 1h at-show live scoresheet (the judge's mobile
 * timer). Renders `@myk9/scoring-ui`'s `LiveScoresheet` (the myK9Q-style
 * stopwatch + result chips + faults) via `useAtShowScoresheet`, with at-show
 * mobile chrome and back-nav to the at-show entry list.
 *
 * Reuses the SAME live scoresheet component + scoring engine the secretary
 * `ScoresheetPage` uses (`getScoresheetComponent(key, 'live')`) — so visual +
 * behavioral parity with myK9Q is inherent. Closes the scoresheet route the
 * at-show entry cards already navigate to (`buildScoreSheetRoute`).
 *
 * Authorization: the outer component is a thin `canScore` gate. The scoring
 * engine (`useAtShowScoresheet`) lives in `ScoresheetContent`, which only mounts
 * when scoring is allowed. Starting a run or submitting a score requires that
 * same structural permission gate.
 */

import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Loader2,
  AlertCircle,
  WifiOff,
  ShieldAlert,
  KeyRound,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { RingsideUpButton } from '@myk9/ui';
import { ScoresheetLeaveGuard } from '@/components/navigation/ScoresheetLeaveGuard';
import { useScoresheetDirty } from '@/components/navigation/useScoresheetDirty';
import { Button } from '@/components/ui/button';
import { getScoresheetComponent } from '@myk9/scoring-ui';
import { RegisteredScoresheetActionBar } from '@/components/scoring/RegisteredScoresheetActionBar';
import { replicatedClassesTable } from '@/services/replication';
// Import triggers self-registration of all LiveScoresheet variants.
import '@myk9/scoring-ui';
import {
  mapSportType,
  MISSING_TRIAL_TYPE_SPORT_TYPE,
  detectScoresheetType,
  toRegistryKey,
  toScoresheetEntry,
  toScoresheetClassInfo,
} from '@/pages/scoring/types';
import { MissingTrialTypeNotice } from '@/pages/scoring/MissingTrialTypeNotice';
import { useAtShowScoresheet } from './useAtShowScoresheet';
import { useAtShowStoragePersistence } from './useAtShowStoragePersistence';
import { AtShowAddToHomeNudge } from './AtShowAddToHomeNudge';
import { MaxTimeNotSetNotice } from './MaxTimeNotSetNotice';
import { CANCELLED_CLASS_MESSAGE } from './cancelledClassGuard';
import { HeldEntryNotice } from './HeldEntryNotice';
import { ScoreSubmitErrorBanner } from './ScoreSubmitErrorBanner';
import { useRingsideEffectiveRole } from './useRingsideEffectiveRole';
import { useJudgeAssignedToClass } from './useJudgeAssignedToClass';
import { AtShowScoresheetIdentityUnavailable } from './AtShowScoresheetIdentityUnavailable';
import { useAtShowAudioMute } from './useAtShowAudioMute';
import { badgeClass } from './slots/atShowChrome.helpers';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';
import { supabase } from '@/services/database/supabaseClient';
import { useAudioWarnings } from '@/hooks/useAudioWarnings';
import { DEFAULT_AUDIO_SETTINGS } from '@/constants/audioSettings';
import { speakRemainingSeconds } from './atShowVoiceAnnouncement';
import { QuickAdvancePanel } from './quickAdvancePanel';
import { AtShowScoresheetSkeleton } from './AtShowScoresheetSkeleton';
import {
  COMBINED_PARAM,
  buildAtShowScoreSheetRoute,
  pairedClassIdFor,
  resolveScoreSheetEntryListRoute,
} from './atShowScoresheetRoutes';

export const AtShowScoresheetPage: React.FC = () => {
  const { showId, classId, entryId } = useParams<{
    showId: string;
    classId: string;
    entryId: string;
  }>();
  const navigate = useNavigate();

  // A scoresheet opened from a combined A/B list carries the pair, so Back
  // returns to that list instead of this dog's single section.
  const [searchParams] = useSearchParams();
  const combined = searchParams.get(COMBINED_PARAM);
  const backRoute = resolveScoreSheetEntryListRoute(showId ?? '', classId ?? '', combined);
  const handleBack = useCallback(() => navigate(backRoute), [navigate, backRoute]);

  // Fine-grained scoring authorization. The `STAFF_ROLES` route guard admits
  // stewards (they check in dogs / set run order), but ringside's permission
  // model gives stewards `canScore: false`. Derive the effective ringside role
  // the same way the EntryList shims do — account RBAC, overridden by a Phase 1c
  // show-scoped passcode grant.
  const { hasPermission, showRole } = useRingsideEffectiveRole(showId);
  const { user } = useAuthContext();
  const isAnonymous = user?.is_anonymous === true;
  const [signOutError, setSignOutError] = useState(false);

  // The only passcode path that actually authorizes scoring is an ANONYMOUS
  // guest session (validate-passcode stamps the show-scoped claim only on anon
  // sessions). A signed-in judge must therefore sign out first, then enter the
  // passcode as a guest. We sign out via supabase DIRECTLY rather than the
  // AuthContext `signOut` (which hard-redirects to '/', clobbering the
  // navigation below), scoped `local` so we don't revoke the user's other
  // devices. Crucially, auth-js removes the on-device session even when the
  // revoke request errors, so the returned { error } does NOT tell us whether
  // we're still signed in — decide by the ACTUAL resulting session instead. If
  // it's gone (the normal case, error or not) we clear the in-memory ringside
  // grant (the hard reload we skipped is what ringsideGrantStore otherwise
  // relied on) and open the passcode form; only a still-live session stays put.
  const handleSignOutToPasscode = useCallback(async () => {
    setSignOutError(false);
    await supabase.auth.signOut({ scope: 'local' });
    // Proceed ONLY when we can positively confirm no session remains. A retained
    // session, OR an inconclusive read — auth-js returns { session: null, error }
    // when an expired token's refresh fails transiently (e.g. offline) while
    // keeping the persisted session for a later retry — keeps us here with a
    // retry message. Navigating then would strand the judge: once connectivity
    // returns, anonymous passcode sign-in refuses to replace the live account.
    const { data, error } = await supabase.auth.getSession();
    if (data.session || error) {
      setSignOutError(true);
      return;
    }
    await replicatedClassesTable.clearCachedHideCounts();
    useRingsideGrantStore.getState().clearGrant();
    navigate('/at-show?passcode=1');
  }, [navigate]);

  // MYK9-82: `ringside_update_entry()` authorizes a signed-in judge ACCOUNT only
  // when it is assigned to THIS class — the `canScore` permission above checks
  // only the ROLE. A passcode grant does NOT establish server authz for an
  // account session (validate-passcode stamps only anonymous sessions), so a
  // signed-in judge — with or without a grant — who isn't assigned would submit
  // an optimistic score that dead-letters at sync. This checks assignment first.
  // Called unconditionally (hooks can't follow the early return below); it
  // self-resolves 'not-applicable' for every session this doesn't concern
  // (anonymous passcode sessions, manager accounts, stewards, exhibitors).
  const assignmentCheck = useJudgeAssignedToClass({ showRole, isAnonymous, classId });

  // Gate BEFORE mounting the scoring engine: an unauthorized role must never run
  // `useAtShowScoresheet` (whose Start marks the dog in-ring via `transitionToInRing`),
  // so the denial blocks every side effect, not just the final submit.
  if (!hasPermission('canScore')) {
    return (
      <main className="ringside-root container max-w-2xl mx-auto px-4 py-6">
        <div className="rounded-xl border bg-card p-6 text-center">
          <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">No Scoring Access</p>
          <p className="text-muted-foreground">
            Your role can view ringside but isn&apos;t allowed to submit scores. Ask the secretary
            for a judge passcode if you need to score this class.
          </p>
          <RingsideUpButton label="Entries" onClick={handleBack} />
        </div>
      </main>
    );
  }

  if (assignmentCheck.status === 'checking') {
    return <AtShowScoresheetSkeleton />;
  }

  if (assignmentCheck.status === 'identity-unavailable') {
    return (
      <AtShowScoresheetIdentityUnavailable onRetry={assignmentCheck.retry} onBack={handleBack} />
    );
  }

  if (assignmentCheck.status === 'unassigned') {
    return (
      <main className="ringside-root container max-w-2xl mx-auto px-4 py-6">
        <div className="rounded-xl border bg-card p-6 text-center">
          <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">You&apos;re not assigned to judge this class</p>
          <p className="text-muted-foreground">
            Scores from an unassigned account can&apos;t be saved. Ask the secretary to add you as
            the judge for this class. To score with a show passcode instead, sign out and enter it
            as a guest.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <RingsideUpButton label="Entries" onClick={handleBack} />
            <Button variant="ghost" onClick={handleSignOutToPasscode}>
              <KeyRound className="h-4 w-4 mr-2" />
              Sign out to use a passcode
            </Button>
          </div>
          {signOutError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              Couldn&apos;t sign out — check your connection and try again.
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <ScoresheetContent
      showId={showId}
      classId={classId}
      entryId={entryId}
      combined={combined}
      onBack={handleBack}
    />
  );
};

interface ScoresheetContentProps {
  showId: string | undefined;
  classId: string | undefined;
  entryId: string | undefined;
  combined: string | null;
  onBack: () => void;
}

/**
 * The authorized scoresheet body. Mounted only when `canScore` is true, so its
 * `useAtShowScoresheet` engine (data load, Start's `transitionToInRing`, submit) runs
 * exclusively for roles allowed to score.
 */
const ScoresheetContent: React.FC<ScoresheetContentProps> = ({
  showId,
  classId,
  entryId,
  combined,
  onBack,
}) => {
  const navigate = useNavigate();
  // The sheet reports whether leaving would lose work; the guard owns the one prompt.
  const { sheetDirty, dirtyRef, onDirtyChange: setSheetDirty } = useScoresheetDirty();
  // MYK9-83: saving lands on a "Saved" state with optional up-next chips
  // instead of navigating away on its own. NOTHING here auto-advances — the
  // judge either taps a candidate or goes back to the list (the default).
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);
  const handleScored = useCallback(() => setSavedEntryId(entryId ?? null), [entryId]);
  const handlePickEntry = useCallback(
    (nextEntryId: string, nextClassId: string) => {
      setSavedEntryId(null);
      // The normal scoresheet route, so the picked dog goes through the same
      // load + in-ring path as a tap from the entry list.
      // A chip from the other section opens under ITS class, keeping the pair.
      // REPLACE, not push: the sheet being left is already saved, so the back
      // gesture from the next dog goes where the judge came from instead of
      // stepping back through every dog scored (MYK9-1500).
      navigate(
        buildAtShowScoreSheetRoute(
          showId ?? '',
          nextClassId || (classId ?? ''),
          nextEntryId,
          combined
        ),
        { replace: true }
      );
    },
    [navigate, showId, classId, combined]
  );
  const {
    entry,
    classInfo,
    rules,
    trialSportType,
    trialId,
    trialDate,
    trialNumber,
    trialName,
    isLoading,
    awaitingRegistrationNumber,
    classCancelled,
    error,
    loadedClassId,
    loadedEntryId,
    retry,
    reload,
    submit,
    startRun,
    isSyncing,
    hasSyncError,
    submitError,
    clearSubmitError,
  } = useAtShowScoresheet({ showId, classId, entryId, onScored: handleScored });
  const handleCorrectScore = useCallback(() => {
    setSavedEntryId(null);
    // Same URL is a no-op in React Router, so re-read the row instead.
    // INTENT: the optimistic save already wrote that score to the local
    // replica, so this reads it from the device and never waits on the venue
    // network. A forced foreground sync here held a judge on the skeleton for
    // 10-40 s offline (MYK9-1106); the error screen's Retry still forces one.
    reload();
  }, [reload]);
  // Requests persistent storage on entering the scoring surface; may surface an
  // iOS "Add to Home Screen" nudge when durable storage isn't granted.
  const { showAddToHomeNudge, nudgeReason, installInstructions, dismissNudge } =
    useAtShowStoragePersistence();
  const isLoadedRoute = loadedClassId === classId && loadedEntryId === entryId;
  const hasAnyScoresheetState = Boolean(entry || classInfo || rules);

  // Timer audio (30-second warning chime + optional voice announcement) —
  // MYK9-76. Muting sets volume to 0 rather than skipping playWarning() so
  // useAudioWarnings' existing volume-gate (`if (!config.volume) return`)
  // does the silencing; the Master-level suppression itself lives inside
  // `useStopwatch` (it never calls onWarningChime/onVoiceAnnouncement for
  // Master runs) and must not be duplicated here.
  // The button is the scoresheet's own mute (chime and voice together, synced across tabs).
  // Whether the warning is spoken at all is the separate Settings switch, read inside
  // `speakRemainingSeconds` (MYK9-1510); the button never writes it.
  const [audioMuted, toggleAudioMuted] = useAtShowAudioMute();
  const audioSettings = useMemo(
    () => ({ ...DEFAULT_AUDIO_SETTINGS, volume: audioMuted ? 0 : DEFAULT_AUDIO_SETTINGS.volume }),
    [audioMuted]
  );
  const audio = useAudioWarnings(audioSettings);
  const handleVoiceAnnouncement = useCallback(
    (secondsRemaining: number) => {
      if (audioMuted) return;
      speakRemainingSeconds(secondsRemaining);
    },
    [audioMuted]
  );

  if (savedEntryId) {
    return (
      <QuickAdvancePanel
        classId={classId}
        pairedClassId={pairedClassIdFor(classId ?? '', combined)}
        scoredEntryId={savedEntryId}
        onBackToList={onBack}
        onCorrectScore={handleCorrectScore}
        onPickEntry={handlePickEntry}
      />
    );
  }

  if (isLoading || (!isLoadedRoute && hasAnyScoresheetState)) {
    return <AtShowScoresheetSkeleton />;
  }

  if (error || !entry || !classInfo || !rules) {
    return (
      <main className="ringside-root flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-medium text-destructive">
          {error || 'Failed to load scoresheet'}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={retry}>Try again</Button>
          <RingsideUpButton label="Entries" onClick={onBack} />
        </div>
      </main>
    );
  }

  // MYK9-1847: a cancelled class takes no score. Read live from the class row, so a class
  // cancelled while the sheet is open lands here too, and un-cancelling restores the sheet.
  if (classCancelled) {
    return (
      <main className="ringside-root container max-w-2xl mx-auto px-4 py-6">
        <div role="status" className="rounded-xl border bg-card p-6 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">Class cancelled</p>
          <p className="text-muted-foreground">{CANCELLED_CLASS_MESSAGE}</p>
          <RingsideUpButton label="Entries" onClick={onBack} />
        </div>
      </main>
    );
  }

  // MYK9-1162: held when the sheet loaded, so it is locked. A hold that arrives
  // later leaves the sheet working; the server refuses that save and the banner
  // above shows why.
  if (awaitingRegistrationNumber) {
    // HeldEntryNotice is shared with the secretary ScoresheetPage, whose layout
    // already supplies the page main, so the ringside landmark lives here (MYK9-1555).
    return (
      <main>
        <HeldEntryNotice
          onBack={onBack}
          submit={submit}
          submitError={submitError}
          onDismissError={clearSubmitError}
          onCheckAgain={reload}
        />
      </main>
    );
  }

  // Resolve sport type from the trial (preferred) or class name (fallback).
  const { organization, sportType } = trialSportType
    ? mapSportType(trialSportType)
    : detectScoresheetType(classInfo);
  const registryKey = toRegistryKey(organization, sportType);
  const LiveScoresheet = registryKey ? getScoresheetComponent(registryKey, 'live') : null;

  if (!LiveScoresheet) {
    return (
      <main className="ringside-root container max-w-2xl mx-auto px-4 py-6">
        <div className="rounded-xl border bg-card p-6 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">Scoresheet Not Available</p>
          {trialSportType === MISSING_TRIAL_TYPE_SPORT_TYPE ? (
            <MissingTrialTypeNotice trialId={trialId} showId={showId} />
          ) : (
            <p className="text-muted-foreground">
              The scoresheet for {organization} {sportType} is not yet implemented.
            </p>
          )}
          <RingsideUpButton label="Entries" onClick={onBack} />
        </div>
      </main>
    );
  }

  return (
    <main className="ringside-root">
      {showAddToHomeNudge && (
        // iOS Safari, not installed, persistence not granted: without Add-to-Home
        // the browser purges IndexedDB (and the backup) after 7 days idle, which
        // would lose queued scores. Calm, dismissible — this is guidance, not an error.
        <AtShowAddToHomeNudge
          reason={nudgeReason}
          installInstructions={installInstructions}
          onDismiss={dismissNudge}
        />
      )}
      <ScoresheetLeaveGuard isDirty={sheetDirty} dirtyRef={dirtyRef} />
      {submitError && <ScoreSubmitErrorBanner message={submitError} onDismiss={clearSubmitError} />}
      {(isSyncing || hasSyncError) && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm"
        >
          {isSyncing && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-info/10 text-info rounded-full">
              <Loader2 className="h-4 w-4 animate-spin" />
              Syncing score...
            </div>
          )}
          {hasSyncError && !isSyncing && (
            // Offline is normal, not broken (PRODUCT.md): a calm neutral tone,
            // not alarm-orange. The token carries both light and dark values.
            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${badgeClass(
                'neutral'
              )}`}
            >
              <WifiOff className="h-4 w-4" />
              Offline, score saved locally
            </div>
          )}
        </div>
      )}
      {/* `LiveScoresheet` is a stable registry lookup (getScoresheetComponent by
          a fixed sport key), not a component created during render — same
          dispatch pattern as the secretary ScoresheetPage. */}
      <MaxTimeNotSetNotice maxTimeSeconds={rules.maxTimeSeconds} registryKey={registryKey} />
      <RegisteredScoresheetActionBar>
        {/* eslint-disable-next-line react-hooks/static-components */}
        <LiveScoresheet
          entry={toScoresheetEntry(entry, classInfo, registryKey)}
          classInfo={toScoresheetClassInfo(classInfo, trialDate, trialNumber, trialName)}
          rules={rules}
          onSubmit={submit}
          onRunStart={startRun}
          onBack={onBack}
          backLabel="Entries"
          onDirtyChange={setSheetDirty}
          onWarningChime={audio.playWarning}
          onVoiceAnnouncement={handleVoiceAnnouncement}
          enableVoiceAnnouncements={!audioMuted}
          headerActions={
            <>
              <button
                type="button"
                onClick={toggleAudioMuted}
                aria-label={audioMuted ? 'Unmute timer sounds' : 'Mute timer sounds'}
                aria-pressed={audioMuted}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm"
              >
                {audioMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </>
          }
        />
      </RegisteredScoresheetActionBar>
    </main>
  );
};

export default AtShowScoresheetPage;
