import { supabase } from '@/lib/supabase';
import type {
  StatsContext,
  JudgeStat,
  StatsQueryResult
} from '../types/stats.types';
import { applyLevelFilters, applyCommonFilters } from './eventStats';

// ========================================
// STRING HELPERS
// ========================================

export function normalizeJudgeName(name: string | null | undefined): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getJudgeDisplayName(name: string | null | undefined): string {
  if (!name) return 'TBD';
  return name.trim();
}

// ========================================
// JUDGE STATS
// ========================================

export function aggregateJudgeStatsFromData(
  summaryData: StatsQueryResult[],
  completedClassIds?: Set<number> | null
): JudgeStat[] {
  const judgeMap = new Map<string, {
    displayName: string;
    classesJudged: Set<string>;
    totalEntries: number;
    qualifiedCount: number;
    qualifiedTimes: number[];
  }>();

  for (const entry of summaryData) {
    if (!entry.judge_name || !entry.class_id) continue;

    const normalizedKey = normalizeJudgeName(entry.judge_name);
    if (!normalizedKey) continue;

    const existing = judgeMap.get(normalizedKey) || {
      displayName: getJudgeDisplayName(entry.judge_name),
      classesJudged: new Set<string>(),
      totalEntries: 0,
      qualifiedCount: 0,
      qualifiedTimes: []
    };

    existing.classesJudged.add(entry.class_id);
    existing.totalEntries++;

    if (entry.result_status === 'qualified') {
      existing.qualifiedCount++;
      const isFromCompletedClass = !completedClassIds || completedClassIds.has(Number(entry.class_id));
      if (entry.search_time_seconds && entry.search_time_seconds > 0 && isFromCompletedClass) {
        existing.qualifiedTimes.push(entry.search_time_seconds);
      }
    }

    judgeMap.set(normalizedKey, existing);
  }

  return Array.from(judgeMap.values())
    .map(stats => ({
      judgeName: stats.displayName,
      classesJudged: stats.classesJudged.size,
      totalEntries: stats.totalEntries,
      qualifiedCount: stats.qualifiedCount,
      qualificationRate: stats.totalEntries > 0 ? (stats.qualifiedCount / stats.totalEntries) * 100 : 0,
      averageQualifiedTime: stats.qualifiedTimes.length > 0
        ? stats.qualifiedTimes.reduce((sum, t) => sum + t, 0) / stats.qualifiedTimes.length
        : null
    }))
    .sort((a, b) => b.totalEntries - a.totalEntries)
    .slice(0, 10);
}

export async function fetchJudgeStatsFromView(
  context: StatsContext,
  licenseKey: string
): Promise<JudgeStat[]> {
  let query = supabase
    .from('view_judge_stats')
    .select('*')
    .eq('license_key', licenseKey);

  query = applyLevelFilters(query, context);

  if (context.filters.judge) {
    query = query.eq('judge_name', context.filters.judge);
  }

  const { data, error } = await query
    .order('total_entries', { ascending: false })
    .limit(10);

  if (error) throw error;

  const judgeAggregateMap = new Map<string, {
    displayName: string;
    classesJudged: number;
    totalEntries: number;
    qualifiedCount: number;
    qualifiedTimes: number[];
  }>();

  for (const judge of data || []) {
    const normalizedKey = normalizeJudgeName(judge.judge_name);
    if (!normalizedKey) continue;

    const existing = judgeAggregateMap.get(normalizedKey) || {
      displayName: getJudgeDisplayName(judge.judge_name),
      classesJudged: 0,
      totalEntries: 0,
      qualifiedCount: 0,
      qualifiedTimes: []
    };

    existing.classesJudged += judge.classes_judged;
    existing.totalEntries += judge.total_entries;
    existing.qualifiedCount += judge.qualified_count;

    if (judge.avg_qualified_time && judge.avg_qualified_time > 0) {
      for (let i = 0; i < judge.qualified_count; i++) {
        existing.qualifiedTimes.push(judge.avg_qualified_time);
      }
    }

    judgeAggregateMap.set(normalizedKey, existing);
  }

  return Array.from(judgeAggregateMap.values())
    .map(stats => ({
      judgeName: stats.displayName,
      classesJudged: stats.classesJudged,
      totalEntries: stats.totalEntries,
      qualifiedCount: stats.qualifiedCount,
      qualificationRate: stats.totalEntries > 0 ? (stats.qualifiedCount / stats.totalEntries) * 100 : 0,
      averageQualifiedTime: stats.qualifiedTimes.length > 0
        ? stats.qualifiedTimes.reduce((sum, t) => sum + t, 0) / stats.qualifiedTimes.length
        : null
    }))
    .sort((a, b) => b.totalEntries - a.totalEntries)
    .slice(0, 10);
}

export async function fetchJudgeSummaryData(
  context: StatsContext,
  licenseKey: string
): Promise<StatsQueryResult[]> {
  let query = supabase
    .from('view_stats_summary')
    .select('*')
    .eq('license_key', licenseKey);

  if (context.level === 'show' && context.showId) {
    query = query.eq('show_id', context.showId);
  } else if (context.level === 'trial' && context.trialId) {
    query = query.eq('trial_id', context.trialId);
  }

  query = applyCommonFilters(query, context.filters);

  const { data, error } = await query;
  if (error) throw error;

  return data || [];
}
