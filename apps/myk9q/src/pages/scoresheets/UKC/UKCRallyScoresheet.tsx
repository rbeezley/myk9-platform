/**
 * UKC Rally Scoresheet (myK9Q Wrapper)
 *
 * Thin wrapper around the shared UKCRallyLiveScoresheet from @myk9/scoring-ui.
 * Handles app-specific concerns:
 * - Entry loading via useEntryNavigation
 * - Score submission via useOptimisticScoring
 * - Class completion celebration via useClassCompletion
 * - Ring status cleanup via markInRing
 * - Voice announcement settings from useSettingsStore
 *
 * Tasks 18-19: Scoresheet convergence migration.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { UKCRallyLiveScoresheet } from '@myk9/scoring-ui';
import type { ScoresheetEntry, ScoresheetClassInfo, ScoreData } from '@myk9/scoring-ui';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useOptimisticScoring } from '../../../hooks/useOptimisticScoring';
import { useClassCompletion } from '../../../hooks/useClassCompletion';
import { markInRing } from '../../../services/entryService';
import { ScoresheetLoader } from '../../../components/LoadingSpinner';
import { useScoresheetCore, useEntryNavigation } from '../hooks';
import { logger } from '@/utils/logger';

export const UKCRallyScoresheet: React.FC = () => {
  const navigate = useNavigate();
  const settings = useSettingsStore(state => state.settings);

  // Core scoresheet state (provides classId/entryId from route params)
  const core = useScoresheetCore({ sportType: 'UKC_RALLY' });

  // Entry navigation and loading
  const navigation = useEntryNavigation({
    classId: core.classId,
    entryId: core.entryId,
    sportType: 'UKC_RALLY',
    onLoadingChange: core.setIsLoadingEntry,
  });

  const { submitScoreOptimistically } = useOptimisticScoring();
  const { CelebrationModal, checkCompletion } = useClassCompletion(core.classId);

  if (
    core.isLoadingEntry ||
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
      classId: parseInt(core.classId!, 10),
      armband: currentEntry.armband,
      className: entry.className,
      scoreData: {
        resultText: scoreData.resultText,
        searchTime: scoreData.searchTime || '',
        points: scoreData.points || 0,
        deductions: scoreData.faultCount || 0,
        ...(scoreData.nonQualifyingReason && {
          nonQualifyingReason: scoreData.nonQualifyingReason,
        }),
      },
      onSuccess: async () => {
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
      <UKCRallyLiveScoresheet
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

export default UKCRallyScoresheet;
