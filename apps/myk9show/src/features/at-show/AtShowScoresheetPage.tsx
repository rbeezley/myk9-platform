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
 */

import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowLeft, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

export const AtShowScoresheetPage: React.FC = () => {
  const { showId, classId, entryId } = useParams<{
    showId: string;
    classId: string;
    entryId: string;
  }>();
  const navigate = useNavigate();

  const backRoute = `/at-show/${showId}/class/${classId}`;
  const handleBack = useCallback(() => navigate(backRoute), [navigate, backRoute]);

  const {
    entry,
    classInfo,
    rules,
    trialSportType,
    trialDate,
    trialNumber,
    isLoading,
    error,
    submit,
    isSyncing,
    hasSyncError,
  } = useAtShowScoresheet({ classId, entryId, onScored: handleBack });

  if (isLoading) {
    return (
      <div className="ringside-root flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !entry || !classInfo || !rules) {
    return (
      <div className="ringside-root flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-medium text-destructive">{error || 'Failed to load scoresheet'}</p>
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Entry List
        </Button>
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
          <Button variant="outline" className="mt-4" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Entry List
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="ringside-root">
      {(isSyncing || hasSyncError) && (
        <div className="fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm">
          {isSyncing && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full">
              <Loader2 className="h-4 w-4 animate-spin" />
              Syncing score...
            </div>
          )}
          {hasSyncError && !isSyncing && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-100 text-orange-800 rounded-full">
              <WifiOff className="h-4 w-4" />
              Offline - score saved locally
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
        onBack={handleBack}
      />
    </div>
  );
};

export default AtShowScoresheetPage;
