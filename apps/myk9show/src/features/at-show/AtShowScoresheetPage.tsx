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
 * when scoring is allowed — so a denied role runs NONE of the scoring-flow side
 * effects (notably `transitionToInRing`, which auto-advances an entry to in-ring
 * on load). The block is structural, not a hidden submit button.
 */

import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  WifiOff,
  ShieldAlert,
  KeyRound,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { getScoresheetComponent } from '@myk9/scoring-ui';
// Import triggers self-registration of all LiveScoresheet variants.
import '@myk9/scoring-ui';
import {
  mapSportType,
  detectScoresheetType,
  toRegistryKey,
  toScoresheetEntry,
  toScoresheetClassInfo,
} from '@/pages/scoring/types';
import { useAtShowScoresheet } from './useAtShowScoresheet';
import { useAtShowStoragePersistence } from './useAtShowStoragePersistence';
import { AtShowAddToHomeNudge } from './AtShowAddToHomeNudge';
import { useRingsideEffectiveRole } from './useRingsideEffectiveRole';
import { useJudgeAssignedToClass } from './useJudgeAssignedToClass';
import { useAtShowAudioMute } from './useAtShowAudioMute';
import { badgeClass } from './slots/atShowChrome.helpers';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';
import { supabase } from '@/services/database/supabaseClient';
import { useAudioWarnings } from '@/hooks/useAudioWarnings';
import { DEFAULT_AUDIO_SETTINGS } from '@/constants/audioSettings';
import { speakRemainingSeconds } from './atShowVoiceAnnouncement';
import { QuickAdvancePanel } from './quickAdvancePanel';

export const AtShowScoresheetPage: React.FC = () => {
  const { showId, classId, entryId } = useParams<{
    showId: string;
    classId: string;
    entryId: string;
  }>();
  const navigate = useNavigate();

  const backRoute = `/at-show/${showId}/class/${classId}`;
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
  // `useAtShowScoresheet` (whose load effect calls `transitionToInRing`), so the
  // denial blocks every side effect, not just the final submit.
  if (!hasPermission('canScore')) {
    return (
      <div className="ringside-root container max-w-2xl mx-auto px-4 py-6">
        <div className="rounded-xl border bg-card p-6 text-center">
          <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">No Scoring Access</p>
          <p className="text-muted-foreground">
            Your role can view ringside but isn&apos;t allowed to submit scores. Ask the secretary
            for a judge passcode if you need to score this class.
          </p>
          <Button variant="outline" className="mt-4" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Entry List
          </Button>
        </div>
      </div>
    );
  }

  if (assignmentCheck.status === 'checking') {
    return <AtShowScoresheetSkeleton />;
  }

  if (assignmentCheck.status === 'unassigned') {
    return (
      <div className="ringside-root container max-w-2xl mx-auto px-4 py-6">
        <div className="rounded-xl border bg-card p-6 text-center">
          <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">You&apos;re not assigned to judge this class</p>
          <p className="text-muted-foreground">
            Scores from an unassigned account can&apos;t be saved. Ask the secretary to add you as
            the judge for this class. To score with a show passcode instead, sign out and enter it
            as a guest.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Entry List
            </Button>
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
      </div>
    );
  }

  return (
    <ScoresheetContent showId={showId} classId={classId} entryId={entryId} onBack={handleBack} />
  );
};

interface ScoresheetContentProps {
  showId: string | undefined;
  classId: string | undefined;
  entryId: string | undefined;
  onBack: () => void;
}

function AtShowScoresheetSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading scoresheet"
      className="ringside-root mx-auto max-w-2xl space-y-4 px-4 py-6"
    >
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-11 w-28" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-12 w-16 rounded-lg" />
        </div>
        <Skeleton className="mb-5 h-28 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 flex-1" />
      </div>
    </div>
  );
}

/**
 * The authorized scoresheet body. Mounted only when `canScore` is true, so its
 * `useAtShowScoresheet` engine (data load + `transitionToInRing` + submit) runs
 * exclusively for roles allowed to score.
 */
const ScoresheetContent: React.FC<ScoresheetContentProps> = ({
  showId,
  classId,
  entryId,
  onBack,
}) => {
  const navigate = useNavigate();
  // MYK9-83: saving lands on a "Saved" state with optional up-next chips
  // instead of navigating away on its own. NOTHING here auto-advances — the
  // judge either taps a candidate or goes back to the list (the default).
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);
  const handleScored = useCallback(() => setSavedEntryId(entryId ?? null), [entryId]);
  const handlePickEntry = useCallback(
    (nextEntryId: string) => {
      setSavedEntryId(null);
      // The normal scoresheet route, so the picked dog goes through the same
      // load + `transitionToInRing` path as a tap from the entry list.
      navigate(`/at-show/${showId}/class/${classId}/score/${nextEntryId}`);
    },
    [navigate, showId, classId]
  );
  const handleCorrectScore = useCallback(() => {
    setSavedEntryId(null);
    navigate(`/at-show/${showId}/class/${classId}/score/${entryId}`);
  }, [navigate, showId, classId, entryId]);

  const {
    entry,
    classInfo,
    rules,
    trialSportType,
    trialDate,
    trialNumber,
    isLoading,
    error,
    loadedClassId,
    loadedEntryId,
    retry,
    submit,
    isSyncing,
    hasSyncError,
    submitError,
    clearSubmitError,
  } = useAtShowScoresheet({ showId, classId, entryId, onScored: handleScored });
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
      <div className="ringside-root flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-medium text-destructive">
          {error || 'Failed to load scoresheet'}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={retry}>Retry</Button>
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Entry List
          </Button>
        </div>
      </div>
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
      <div className="ringside-root container max-w-2xl mx-auto px-4 py-6">
        <div className="rounded-xl border bg-card p-6 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">Scoresheet Not Available</p>
          <p className="text-muted-foreground">
            The scoresheet for {organization} {sportType} is not yet implemented.
          </p>
          <Button variant="outline" className="mt-4" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Entry List
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="ringside-root">
      <button
        type="button"
        onClick={toggleAudioMuted}
        aria-label={audioMuted ? 'Unmute timer sounds' : 'Mute timer sounds'}
        aria-pressed={audioMuted}
        className="fixed right-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm"
      >
        {audioMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
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
      {submitError && (
        // A genuine "score not saved" failure — the durable queue write threw or
        // returned no mutation id. Unlike the calm offline indicator, this is an
        // error the judge MUST act on: the score is NOT saved and they stayed on
        // the sheet to retry. Alarm tone is intentional here.
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-center text-sm font-medium text-destructive-foreground"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{submitError}</span>
          <button
            type="button"
            onClick={clearSubmitError}
            className="ml-2 underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}
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
      {/* eslint-disable-next-line react-hooks/static-components */}
      <LiveScoresheet
        entry={toScoresheetEntry(entry, classInfo)}
        classInfo={toScoresheetClassInfo(classInfo, trialDate, trialNumber)}
        rules={rules}
        onSubmit={submit}
        onBack={onBack}
        onWarningChime={audio.playWarning}
        onVoiceAnnouncement={handleVoiceAnnouncement}
        enableVoiceAnnouncements={!audioMuted}
      />
    </div>
  );
};

export default AtShowScoresheetPage;
