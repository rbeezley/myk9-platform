/**
 * Placement Calculator Service Helpers
 *
 * Pure helper functions for placement calculation, tie-breaking,
 * serialization, and score value extraction.
 */

import { logger } from '@/services/LoggingService';
import type {
  BaseScore,
  ScoringFormat,
  PlacementCalculation,
  PlacementEntry,
  AppliedTieBreaker,
  PlacementRule,
  TieBreakingRule,
} from '@/types/scoring-types';
import {
  DEFAULT_SCORING_CONFIGS,
  isAgilityScore,
  isObedienceScore,
  isRallyScore,
  isConformationScore,
} from '@/types/scoring-types';

// ========================================================================
// Score Value Extraction
// ========================================================================

/**
 * Extract a numeric value from a placement entry based on criteria and format.
 */
export function extractValue(
  entry: PlacementEntry,
  criteria: string,
  format: ScoringFormat
): number {
  const score = entry.rawScore;

  // Common criteria
  switch (criteria) {
    case 'primaryScore':
      return typeof entry.primaryScore === 'number' ? entry.primaryScore : 0;
    case 'secondaryScore':
      return entry.secondaryScore || 0;
    case 'qualification':
      return score.qualification === 'Qualified' ? 1 : 0;
  }

  // Format-specific criteria
  if (isAgilityScore(score)) {
    switch (criteria) {
      case 'totalFaults':
        return score.totalFaults;
      case 'courseTime':
        return score.courseTime;
      case 'jumpFaults':
        return score.jumpFaults;
      case 'refusals':
        return score.refusals;
      case 'yardagePerSecond':
        return score.yardagePerSecond || 0;
    }
  }

  if (isObedienceScore(score)) {
    switch (criteria) {
      case 'totalScore':
        return score.totalScore ?? 0;
      case 'maximumScore':
        return score.maximumScore ?? 0;
      case 'qualifyingScore':
        return score.qualifyingScore ?? 0;
    }
  }

  if (isRallyScore(score)) {
    switch (criteria) {
      case 'finalScore':
        return score.finalScore;
      case 'courseTime':
        return score.courseTime;
      case 'totalDeductions':
        return score.totalDeductions;
      case 'stationDeductions':
        return score.stationDeductions;
    }
  }

  if (isConformationScore(score)) {
    switch (criteria) {
      case 'placement':
        return score.placement || 999;
      case 'pointsAwarded':
        return score.pointsAwarded;
      case 'gaitScore':
        return score.gaitScore || 0;
      case 'typeScore':
        return score.typeScore || 0;
    }
  }

  // Scent work specific (when score is ScentWorkResult)
  if (format === 'scent_work') {
    switch (criteria) {
      case 'searchTime':
        return (
          (score as BaseScore & { searchTime?: number; totalSearchTime?: number }).searchTime ||
          (score as BaseScore & { searchTime?: number; totalSearchTime?: number })
            .totalSearchTime ||
          0
        );
      case 'faults':
        return (
          (score as BaseScore & { totalFaults?: number }).faults ||
          (score as BaseScore & { totalFaults?: number }).totalFaults ||
          0
        );
      case 'time':
        return (
          (score as BaseScore & { searchTime?: number; totalSearchTime?: number }).searchTime ||
          (score as BaseScore & { searchTime?: number; totalSearchTime?: number })
            .totalSearchTime ||
          0
        );
    }
  }

  logger.warn(`Unknown criteria '${criteria}' for format '${format}'`, 'scoring', {});
  return 0;
}

// ========================================================================
// Placement Entry Creation
// ========================================================================

/**
 * Create a PlacementEntry from a BaseScore and optional metadata.
 */
export function createPlacementEntry(
  score: BaseScore,
  metadata?: { dogName: string; handlerName: string; armband: string }
): PlacementEntry {
  let primaryScore: number | string = 0;
  let secondaryScore: number | undefined;

  if (isAgilityScore(score)) {
    primaryScore = score.totalFaults;
    secondaryScore = score.courseTime;
  } else if (isObedienceScore(score)) {
    primaryScore = score.totalScore ?? 0;
  } else if (isRallyScore(score)) {
    primaryScore = score.finalScore;
    secondaryScore = score.courseTime;
  } else if (isConformationScore(score)) {
    primaryScore = score.placement || 999;
    secondaryScore = score.pointsAwarded;
  } else if (score.format === 'scent_work') {
    primaryScore = score.time || 0;
    secondaryScore = score.faults || 0;
  }

  return {
    entryId: score.entryId,
    dogName: metadata?.dogName || 'Unknown Dog',
    handlerName: metadata?.handlerName || 'Unknown Handler',
    armband: metadata?.armband || '000',
    primaryScore,
    secondaryScore,
    qualification: score.qualification,
    isTied: false,
    rawScore: score,
  };
}

/**
 * Create an empty PlacementCalculation for a class with no qualified entries.
 */
export function createEmptyPlacementCalculation(
  classId: string,
  format: ScoringFormat
): PlacementCalculation {
  return {
    classId,
    format,
    placements: [],
    calculatedAt: new Date(),
    calculatedBy: 'system',
    tieBreakingRules: DEFAULT_SCORING_CONFIGS[format]?.tieBreakingRules || [],
    appliedTieBreakers: [],
  };
}

/**
 * Return an empty array of applied tie breakers.
 * Can be enhanced later to track which rules were actually applied.
 */
export function getAppliedTieBreakers(): AppliedTieBreaker[] {
  return [];
}

// ========================================================================
// Format-Specific Sorting
// ========================================================================

/**
 * Sort placement entries by format-specific rules.
 */
export function sortEntriesByFormat(
  entries: PlacementEntry[],
  format: ScoringFormat,
  placementRules: PlacementRule[]
): PlacementEntry[] {
  return entries.sort((a, b) => {
    for (const rule of placementRules.sort((r1, r2) => r2.weight - r1.weight)) {
      const comparison = compareByRule(a, b, rule, format);
      if (comparison !== 0) {
        return comparison;
      }
    }
    return 0;
  });
}

/**
 * Compare two entries by a single placement rule.
 */
function compareByRule(
  a: PlacementEntry,
  b: PlacementEntry,
  rule: PlacementRule,
  format: ScoringFormat
): number {
  const aValue = extractValue(a, rule.criteria, format);
  const bValue = extractValue(b, rule.criteria, format);

  if (aValue === bValue) return 0;

  const comparison = aValue < bValue ? -1 : 1;
  return rule.direction === 'ascending' ? comparison : -comparison;
}

// ========================================================================
// Tie-Breaking Logic
// ========================================================================

/**
 * Assign placements to entries, marking ties where scores are equal.
 */
export function assignPlacementsWithTieHandling(entries: PlacementEntry[]): PlacementEntry[] {
  if (entries.length === 0) return entries;

  let currentPlacement = 1;
  let lastPrimaryScore = entries[0].primaryScore;
  let lastSecondaryScore = entries[0].secondaryScore;
  let tiedEntries: PlacementEntry[] = [];

  entries.forEach((entry, index) => {
    const samePrimary = entry.primaryScore === lastPrimaryScore;
    const sameSecondary = entry.secondaryScore === lastSecondaryScore;

    if (samePrimary && sameSecondary) {
      tiedEntries.push(entry);
      entry.placement = currentPlacement;
      entry.isTied = tiedEntries.length > 1;
    } else {
      // Mark previous tied entries
      if (tiedEntries.length > 1) {
        tiedEntries.forEach(tiedEntry => {
          tiedEntry.isTied = true;
          tiedEntry.tiedWith = tiedEntries
            .filter(te => te.entryId !== tiedEntry.entryId)
            .map(te => te.entryId);
        });
      }

      // Start new placement group
      currentPlacement = index + 1;
      entry.placement = currentPlacement;
      entry.isTied = false;
      tiedEntries = [entry];

      lastPrimaryScore = entry.primaryScore;
      lastSecondaryScore = entry.secondaryScore;
    }
  });

  // Handle final tied group
  if (tiedEntries.length > 1) {
    tiedEntries.forEach(entry => {
      entry.isTied = true;
      entry.tiedWith = tiedEntries.filter(te => te.entryId !== entry.entryId).map(te => te.entryId);
    });
  }

  return entries;
}

/**
 * Find groups of entries that are tied on placement.
 */
export function findTiedGroups(entries: PlacementEntry[]): PlacementEntry[][] {
  const groups: PlacementEntry[][] = [];
  const processed = new Set<string>();

  entries.forEach(entry => {
    if (processed.has(entry.entryId) || !entry.isTied) return;

    const tiedGroup = entries.filter(e => e.placement === entry.placement && e.isTied);

    tiedGroup.forEach(e => processed.add(e.entryId));
    groups.push(tiedGroup);
  });

  return groups;
}

/**
 * Apply a single tie-breaking rule to a group of tied entries.
 */
export function applyTieBreakingRule(
  tiedEntries: PlacementEntry[],
  rule: TieBreakingRule,
  format: ScoringFormat
): PlacementEntry[] {
  return tiedEntries.sort((a, b) => {
    const aValue = extractValue(a, rule.criteria, format);
    const bValue = extractValue(b, rule.criteria, format);

    if (aValue === bValue) return 0;

    const comparison = aValue < bValue ? -1 : 1;
    return rule.direction === 'ascending' ? comparison : -comparison;
  });
}

/**
 * Check whether all entries in a group have distinct scores (tie fully resolved).
 */
export function isTieFullyResolved(entries: PlacementEntry[]): boolean {
  for (let i = 1; i < entries.length; i++) {
    if (
      entries[i].primaryScore === entries[i - 1].primaryScore &&
      entries[i].secondaryScore === entries[i - 1].secondaryScore
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Update placement numbers after a tie-breaking resolution.
 */
export function updatePlacementsAfterTieBreaking(
  allEntries: PlacementEntry[],
  originalTiedGroup: PlacementEntry[],
  resolvedGroup: PlacementEntry[]
): void {
  const originalPlacement = originalTiedGroup[0].placement!;

  resolvedGroup.forEach((entry, index) => {
    entry.placement = originalPlacement + index;
    entry.isTied = false;
    entry.tiedWith = undefined;
  });

  // Update placements of entries that come after this group
  const maxOriginalPlacement = originalPlacement + originalTiedGroup.length - 1;
  const maxNewPlacement = originalPlacement + resolvedGroup.length - 1;
  const placementShift = maxNewPlacement - maxOriginalPlacement;

  if (placementShift !== 0) {
    allEntries.forEach(entry => {
      if (entry.placement && entry.placement > maxOriginalPlacement) {
        entry.placement += placementShift;
      }
    });
  }
}

/**
 * Resolve ties within groups using the provided tie-breaking rules.
 */
export function resolveTiesWithRules(
  entries: PlacementEntry[],
  tieBreakingRules: TieBreakingRule[],
  format: ScoringFormat
): PlacementEntry[] {
  const tiedGroups = findTiedGroups(entries);

  tiedGroups.forEach(group => {
    if (group.length <= 1) return;

    let resolvedGroup = [...group];

    for (const rule of tieBreakingRules.sort((a, b) => a.priority - b.priority)) {
      resolvedGroup = applyTieBreakingRule(resolvedGroup, rule, format);

      if (isTieFullyResolved(resolvedGroup)) {
        break;
      }
    }

    updatePlacementsAfterTieBreaking(entries, group, resolvedGroup);
  });

  return entries;
}

// ========================================================================
// Serialization / Deserialization
// ========================================================================

/**
 * Serialize a PlacementCalculation for JSON storage.
 */
export function serializePlacementCalculation(calc: PlacementCalculation): Record<string, unknown> {
  return {
    ...calc,
    calculatedAt: calc.calculatedAt.toISOString(),
    placements: calc.placements.map(p => ({
      ...p,
      rawScore: {
        ...p.rawScore,
        timestamp: p.rawScore.timestamp.toISOString(),
        recordedAt: p.rawScore.recordedAt.toISOString(),
        lastModified: p.rawScore.lastModified.toISOString(),
      },
    })),
  };
}

/**
 * Deserialize a PlacementCalculation from JSON storage.
 */
export function deserializePlacementCalculation(data: unknown): PlacementCalculation {
  const calcData = data as Record<string, unknown>;
  return {
    ...calcData,
    calculatedAt: new Date(calcData.calculatedAt as string),
    placements: (calcData.placements as Record<string, unknown>[]).map(p => ({
      ...p,
      rawScore: {
        ...(p.rawScore as Record<string, unknown>),
        timestamp: new Date((p.rawScore as Record<string, unknown>).timestamp as string),
        recordedAt: new Date((p.rawScore as Record<string, unknown>).recordedAt as string),
        lastModified: new Date((p.rawScore as Record<string, unknown>).lastModified as string),
      },
    })),
  } as PlacementCalculation;
}
