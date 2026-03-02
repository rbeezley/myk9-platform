/**
 * Combined hook: merges platform results + manual results, computes title progress per sport.
 */
import { useMemo } from 'react';
import { useExhibitorResults } from '@/hooks/queries/useExhibitorResults';
import { useQualifyingManualResultsQuery } from '@/hooks/queries/useManualResultsDatabase';
import { useSportTemplatesQuery, useAllSportTitlesQuery } from '@/hooks/queries/useSportTemplates';
import {
  computeTitleProgress,
  mapExhibitorResultToLeg,
  mapManualResultToLeg,
  type QualifyingLeg,
  type TitleProgressResult,
} from '@/services/titleEngine';

export function useTitleProgress(dogId: string) {
  const { data: exhibitorResults = [], isLoading: loadingResults } = useExhibitorResults();
  const { data: manualResults = [], isLoading: loadingManual } =
    useQualifyingManualResultsQuery(dogId);
  const { data: templates = [], isLoading: loadingTemplates } = useSportTemplatesQuery();
  const { data: allTitles = [], isLoading: loadingTitles } = useAllSportTitlesQuery();

  const isLoading = loadingResults || loadingManual || loadingTemplates || loadingTitles;

  const progressBySport = useMemo(() => {
    if (isLoading) return {};

    // Build legs for this specific dog
    const platformLegs: QualifyingLeg[] = exhibitorResults
      .filter(r => r.dogId === dogId)
      .map(mapExhibitorResultToLeg)
      .filter((leg): leg is QualifyingLeg => leg !== null);

    const manualLegs: QualifyingLeg[] = manualResults
      .map(mapManualResultToLeg)
      .filter((leg): leg is QualifyingLeg => leg !== null);

    const allLegs = [...platformLegs, ...manualLegs];

    // Group titles by sport_template_id and compute progress per sport
    const result: Record<string, TitleProgressResult[]> = {};

    for (const template of templates) {
      const sportTitles = allTitles.filter(t => t.sport_template_id === template.id);
      if (sportTitles.length === 0) continue;

      const sportLegs = allLegs; // All legs — engine filters by element::level matching
      const progress = computeTitleProgress(sportLegs, sportTitles, template.levels);
      if (progress.length > 0) {
        result[template.id] = progress;
      }
    }

    return result;
  }, [isLoading, exhibitorResults, manualResults, templates, allTitles, dogId]);

  return {
    progressBySport,
    templates,
    isLoading,
  };
}
