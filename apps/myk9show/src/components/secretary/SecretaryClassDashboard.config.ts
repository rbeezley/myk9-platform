import type { ClassData } from '@/components/classes/types/classTypes';
import type { ScentWorkClassConfig } from '@/types/scent-work-types';

/** The slice of a class row the secretary page reads. */
export type SecretaryDashboardClass = Pick<
  ClassData,
  | 'element'
  | 'level'
  | 'judge'
  | 'timeLimitSeconds'
  | 'timeLimitArea2Seconds'
  | 'timeLimitArea3Seconds'
  | 'numAreas'
>;

function positiveMs(seconds: number | null | undefined): number | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? seconds * 1000
    : null;
}

/**
 * The scoring config for the secretary class page, from the class row alone
 * (MYK9-984). Nothing here is invented: `timeLimit` is 0 when the judge has not
 * set one (validators and the page treat 0 as "no limit"), and `multiArea`
 * follows `num_areas`. The element/level casts follow `buildClassConfig`; the
 * database holds registry-specific values the union does not list.
 */
export function buildSecretaryClassConfig(
  cls: SecretaryDashboardClass | null | undefined
): ScentWorkClassConfig {
  const numAreas = cls?.numAreas ?? 0;
  const areaLimits = [cls?.timeLimitSeconds, cls?.timeLimitArea2Seconds, cls?.timeLimitArea3Seconds]
    .slice(0, Math.max(numAreas, 0))
    .map(positiveMs)
    .filter((ms): ms is number => ms !== null);
  const level = cls?.level ?? '';
  return {
    element: (cls?.element ?? '') as ScentWorkClassConfig['element'],
    level: level as ScentWorkClassConfig['level'],
    timeLimit: positiveMs(cls?.timeLimitSeconds) ?? 0,
    multiArea: numAreas > 1,
    ...(numAreas > 1 && areaLimits.length > 0 ? { areaLimits } : {}),
    warningsEnabled: !/^master/i.test(level),
  };
}

/** "3:00", or null when the class has no time limit set. */
export function formatClassTimeLimit(timeLimitMs: number): string | null {
  if (!(timeLimitMs > 0)) return null;
  const totalSeconds = Math.round(timeLimitMs / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/** "Judge: Pat Donovan", or "Judge TBD" when no judge is assigned. */
export function formatClassJudge(judge: string | null | undefined): string {
  const name = judge?.trim();
  return name && name !== 'TBD' ? `Judge: ${name}` : 'Judge TBD';
}
