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

      // Filter to legs belonging to this sport. Manual results carry sport_template_id;
      // platform results don't (they predate per-sport tagging) and are allowed through.
      const sportLegs = allLegs.filter(
        leg => !leg.sport_template_id || leg.sport_template_id === template.id
      );
      const progress = computeTitleProgress(sportLegs, sportTitles, template.levels);
      if (progress.length > 0) {
        result[template.id] = progress;
      }
    }

    return result;
  }, [isLoading, exhibitorResults, manualResults, templates, allTitles, dogId]);

  const earnedAbbreviations = useMemo(
    () =>
      Object.values(progressBySport)
        .flat()
        .filter(t => t.isEarned && !t.isSuperseded)
        .map(t => t.abbreviation)
        .filter((a): a is string => Boolean(a)),
    [progressBySport]
  );

  return {
    progressBySport,
    templates,
    isLoading,
    earnedAbbreviations,
  };
}
