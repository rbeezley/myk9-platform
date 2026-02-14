/**
 * Results Broadcaster Helper Functions
 * Phase 6.2: Live Competition Features
 *
 * Pure/stateless utility functions used by the ResultsBroadcaster service
 * for formatting, parsing, and mapping data.
 */

import type {
  ScoreResult,
  PlacementResult,
  AwardResult,
  ResultsMetrics,
  RealtimeEventPayload,
} from './results-broadcaster-types';

/**
 * Get the ordinal suffix for a number (e.g., 1st, 2nd, 3rd, 4th)
 */
export function getOrdinalSuffix(num: number): string {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

/**
 * Get a human-readable placement title for a position
 */
export function getPlacementTitle(position: number): string {
  switch (position) {
    case 1: return '1st Place';
    case 2: return '2nd Place';
    case 3: return '3rd Place';
    case 4: return '4th Place';
    default: return `${position}${getOrdinalSuffix(position)} Place`;
  }
}

/**
 * Parse raw placement data from a database event into typed placement entries
 */
export function parsePlacementData(placementsData: unknown[]): PlacementResult['placements'] {
  return placementsData
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .map(p => ({
      position: Number(p.position) || 0,
      entryId: String(p.entry_id || ''),
      dogId: String(p.dog_id || ''),
      dogName: String(p.dog_name || 'Unknown'),
      ownerName: String(p.owner_name || 'Unknown'),
      armband: String(p.armband || ''),
      finalScore: Number(p.final_score) || 0,
      qualified: Boolean(p.qualified),
      award: p.award ? String(p.award) : undefined,
      specialAward: p.special_award ? String(p.special_award) : undefined,
    }));
}

/**
 * Create a fresh ResultsMetrics object for a given show
 */
export function initializeMetrics(showId: string): ResultsMetrics {
  return {
    showId,
    scoresPosted: 0,
    placementsCalculated: 0,
    awardsAnnounced: 0,
    notificationsSent: 0,
    averageScorePostingTime: 0,
    peakResultsRate: 0,
    lastActivity: new Date(),
    judgeActivity: new Map(),
  };
}

/**
 * Map a raw database score event payload to a ScoreResult object
 */
export function mapScoreEventToResult(event: RealtimeEventPayload): ScoreResult | null {
  const scoreData = event.payload?.new || event.data;
  if (!scoreData) return null;

  return {
    id: String(scoreData.id || ''),
    entryId: String(scoreData.entry_id || ''),
    dogId: String(scoreData.dog_id || ''),
    dogName: String(scoreData.dog_name || 'Unknown'),
    ownerName: String(scoreData.owner_name || 'Unknown'),
    armband: String(scoreData.armband || ''),
    classId: String(scoreData.class_id || ''),
    className: String(scoreData.class_name || 'Unknown Class'),
    showId: String(scoreData.show_id || ''),
    judgeId: String(scoreData.judge_id || ''),
    judgeName: String(scoreData.judge_name || 'Unknown Judge'),
    score: {
      points: Number(scoreData.points) || 0,
      time: Number(scoreData.time) || 0,
      faults: Number(scoreData.faults) || 0,
      totalScore: Number(scoreData.total_score || scoreData.points) || 0,
      qualifying: Boolean(scoreData.qualifying_score),
      qualified: Boolean(scoreData.qualified),
    },
    placement: scoreData.placement ? {
      position: Number(scoreData.placement),
      total: Number(scoreData.total_entries) || 0,
      qualified: Boolean(scoreData.qualified),
      title: getPlacementTitle(Number(scoreData.placement)),
    } : undefined,
    status: (scoreData.status === 'official' || scoreData.status === 'final' || scoreData.status === 'preliminary')
      ? scoreData.status : 'preliminary',
    timestamp: new Date(),
    submittedAt: scoreData.updated_at || scoreData.created_at
      ? new Date(String(scoreData.updated_at || scoreData.created_at))
      : new Date(),
    notes: scoreData.notes ? String(scoreData.notes) : undefined,
    videoUrl: scoreData.video_url ? String(scoreData.video_url) : undefined,
  };
}

/**
 * Map a raw database placement event payload to a PlacementResult object
 */
export function mapPlacementEventToResult(event: RealtimeEventPayload): PlacementResult | null {
  const placementData = event.payload?.new || event.data;
  if (!placementData) return null;

  return {
    classId: String(placementData.class_id || ''),
    className: String(placementData.class_name || 'Unknown Class'),
    showId: String(placementData.show_id || ''),
    judgeId: String(placementData.judge_id || ''),
    judgeName: String(placementData.judge_name || 'Unknown Judge'),
    placements: parsePlacementData(Array.isArray(placementData.placements) ? placementData.placements : []),
    totalEntries: Number(placementData.total_entries) || 0,
    qualifyingEntries: Number(placementData.qualifying_entries) || 0,
    calculatedAt: placementData.calculated_at || placementData.updated_at
      ? new Date(String(placementData.calculated_at || placementData.updated_at))
      : new Date(),
    isComplete: Boolean(placementData.is_complete),
    isOfficial: Boolean(placementData.is_official),
  };
}

/**
 * Map a raw database award event payload to an AwardResult object
 */
export function mapAwardEventToResult(event: RealtimeEventPayload): AwardResult | null {
  const awardData = event.payload?.new || event.data;
  if (!awardData) return null;

  return {
    id: String(awardData.id || ''),
    type: (awardData.type === 'placement' || awardData.type === 'special' ||
           awardData.type === 'qualification' || awardData.type === 'championship')
           ? awardData.type : 'placement',
    title: String(awardData.title || 'Award'),
    description: String(awardData.description || ''),
    recipient: {
      entryId: String(awardData.entry_id || ''),
      dogId: String(awardData.dog_id || ''),
      dogName: String(awardData.dog_name || 'Unknown'),
      ownerName: String(awardData.owner_name || 'Unknown'),
      armband: String(awardData.armband || ''),
    },
    classId: awardData.class_id ? String(awardData.class_id) : undefined,
    className: awardData.class_name ? String(awardData.class_name) : undefined,
    showId: String(awardData.show_id || ''),
    value: awardData.value ? Number(awardData.value) : undefined,
    criteria: String(awardData.criteria || ''),
    awardedAt: awardData.awarded_at || awardData.created_at
      ? new Date(String(awardData.awarded_at || awardData.created_at))
      : new Date(),
    awardedBy: String(awardData.awarded_by || 'system'),
    certificate: awardData.certificate_template_id ? {
      templateId: String(awardData.certificate_template_id),
      generatedUrl: awardData.certificate_url ? String(awardData.certificate_url) : undefined,
    } : undefined,
  };
}
