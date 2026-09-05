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
import { levelResolverForTemplate } from '@/features/registries/elementLevels';

export function useTitleProgress(dogId: string) {
  const {
    data: exhibitorResults = [],
    isLoading: loadingResults,
    isError: errorResults,
    refetch: refetchResults,
  } = useExhibitorResults(dogId);
  const {
    data: manualResults = [],
    isLoading: loadingManual,
    isError: errorManual,
    refetch: refetchManual,
  } = useQualifyingManualResultsQuery(dogId);
  const {
    data: templates = [],
    isLoading: loadingTemplates,
    isError: errorTemplates,
    refetch: refetchTemplates,
  } = useSportTemplatesQuery();
  const {
    data: allTitles = [],
    isLoading: loadingTitles,
    isError: errorTitles,
    refetch: refetchTitles,
  } = useAllSportTitlesQuery();

  const isLoading = loadingResults || loadingManual || loadingTemplates || loadingTitles;
  const isError = errorResults || errorManual || errorTemplates || errorTitles;

  const refetch = () => {
    void refetchResults();
    void refetchManual();
    void refetchTemplates();
    void refetchTitles();
  };

  const progressBySport = useMemo(() => {
    if (isLoading || isError) return {};

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
      // Levels come from the registry config, per element — NOT from `template.levels`, which
      // is only the grid elements' set. UKC "Excellent Handler Discrimination" and AKC
      // "Detective" have no level in that flat column, so titles for those elements could
      // never resolve a level and never counted a leg.
      const levels = levelResolverForTemplate(template, template.levels);
      const progress = computeTitleProgress(sportLegs, sportTitles, levels);
      if (progress.length > 0) {
        result[template.id] = progress;
      }
    }

    return result;
  }, [isLoading, isError, exhibitorResults, manualResults, templates, allTitles, dogId]);

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
    isError,
    refetch,
    earnedAbbreviations,
  };
}
