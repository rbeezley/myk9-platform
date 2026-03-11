/**
 * AKC Nationals Scent Work Scoresheet (myK9Q Wrapper)
 *
 * Thin wrapper around the shared AKCNationalsLiveScoresheet from @myk9/scoring-ui.
 * Handles app-specific concerns:
 * - Entry loading via useEntryNavigation
 * - Score submission via useOptimisticScoring
 * - Dual submission: regular score + nationals_scores table for TV dashboard
 * - Class completion celebration via useClassCompletion
 * - Ring status cleanup via markInRing
 * - Voice announcement settings from useSettingsStore
 *
 * Tasks 18-19: Scoresheet convergence migration.
 */

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AKCNationalsLiveScoresheet } from '@myk9/scoring-ui';
import type { ScoresheetEntry, ScoresheetClassInfo, ScoreData } from '@myk9/scoring-ui';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useAuth } from '../../../contexts/AuthContext';
import { useOptimisticScoring } from '../../../hooks/useOptimisticScoring';
import { useClassCompletion } from '../../../hooks/useClassCompletion';
import { markInRing } from '../../../services/entryService';
import { nationalsScoring } from '../../../services/nationalsScoring';
import { ScoresheetLoader } from '../../../components/LoadingSpinner';
import { useEntryNavigation } from '../hooks';
import { mapElementToNationalsType, convertTimeToSeconds } from './AKCNationalsScoresheetHelpers';
import { logger } from '@/utils/logger';

export const AKCNationalsScoresheet: React.FC = () => {
  const navigate = useNavigate();
  const settings = useSettingsStore(state => state.settings);
  const { showContext } = useAuth();

  const { classId, entryId } = useParams<{ classId: string; entryId: string }>();
  const [isLoadingEntry, setIsLoadingEntry] = useState(true);

  // Entry navigation and loading
  const navigation = useEntryNavigation({
    classId: classId,
    entryId: entryId,
    isNationals: true,
    sportType: 'AKC_SCENT_WORK_NATIONAL',
    onLoadingChange: setIsLoadingEntry,
  });

  const { submitScoreOptimistically } = useOptimisticScoring();
  const { CelebrationModal, checkCompletion } = useClassCompletion(classId);

  if (
    isLoadingEntry ||
    !navigation.currentEntry ||
    !navigation.classInfo ||
    !navigation.rules
  ) {
    return <ScoresheetLoader />;
  }

  const currentEntry = navigation.currentEntry;

  const entry: ScoresheetEntry = {
    id: currentEntry.id,
    armband: currentEntry.armband,
    dogName: currentEntry.callName ?? '',
    handlerName: currentEntry.handler ?? '',
    className: currentEntry.className ?? '',
    ...(currentEntry.element != null && { element: currentEntry.element }),
    ...(currentEntry.level != null && { level: currentEntry.level }),
    ...(currentEntry.section != null && { section: currentEntry.section }),
  };

  const classInfo: ScoresheetClassInfo = {
    element: navigation.classInfo.element,
    level: navigation.classInfo.level,
    ...(navigation.classInfo.section != null && { section: navigation.classInfo.section }),
  };

  const handleSubmit = async (scoreData: ScoreData) => {
    await submitScoreOptimistically({
      entryId: currentEntry.id,
      classId: parseInt(classId!, 10),
      armband: currentEntry.armband,
      className: entry.className,
      scoreData: {
        resultText: scoreData.resultText,
        searchTime: scoreData.searchTime || '',
        faultCount: scoreData.faultCount || 0,
        points: scoreData.points || 0,
        correctCount: scoreData.correctCount || 0,
        incorrectCount: scoreData.incorrectCount || 0,
        finishCallErrors: scoreData.finishCallErrors || 0,
        ...(scoreData.areaTimes?.length && { areaTimes: scoreData.areaTimes }),
        ...(scoreData.nonQualifyingReason && {
          nonQualifyingReason: scoreData.nonQualifyingReason,
        }),
        ...(Object.keys(scoreData.areas).length > 0 && { areas: scoreData.areas }),
      },
      onSuccess: async () => {
        // Also submit to nationals_scores table for TV dashboard
        if (showContext?.licenseKey) {
          try {
            const timeInSeconds = convertTimeToSeconds(scoreData.searchTime || '0');
            const elementType = mapElementToNationalsType(currentEntry.element || '');

            await nationalsScoring.submitScore({
              entry_id: currentEntry.id,
              armband: currentEntry.armband.toString(),
              element_type: elementType,
              day: 1, // Default - should be determined by trial/class data
              alerts_correct: scoreData.correctCount || 0,
              alerts_incorrect: scoreData.incorrectCount || 0,
              faults: scoreData.faultCount || 0,
              finish_call_errors: scoreData.finishCallErrors || 0,
              time_seconds: timeInSeconds,
              excused: scoreData.resultText === 'EX' || scoreData.resultText === 'Excused',
              notes: undefined,
            });
          } catch (nationalsError) {
            logger.error('Failed to submit Nationals score:', nationalsError);
            // Don't fail the whole submission - regular score still saved
          }
        }

        await checkCompletion();
        await markInRing(currentEntry.id, false).catch(err => {
          logger.error('Failed to clear in-ring status:', err);
        });
        navigate(-1);
      },
    });
  };

  const handleBack = () => {
    markInRing(currentEntry.id, false).catch(err => {
      logger.error('Failed to clear in-ring status:', err);
    });
    navigate(-1);
  };

  return (
    <>
      <AKCNationalsLiveScoresheet
        entry={entry}
        classInfo={classInfo}
        rules={navigation.rules}
        onSubmit={handleSubmit}
        onBack={handleBack}
        enableVoiceAnnouncements={settings.voiceAnnouncements}
      />
      {CelebrationModal}
    </>
  );
};

export default AKCNationalsScoresheet;
