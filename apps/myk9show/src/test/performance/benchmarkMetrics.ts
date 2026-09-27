export interface RankableSample {
  status: 'measured' | 'blocked';
  timeToUsableMs?: number;
}

/** Rank only usable measurements so unavailable pages can never look fast. */
export function rankSlowestRoutes<T extends RankableSample>(samples: readonly T[]): T[] {
  return samples
    .filter(
      (sample): sample is T & { timeToUsableMs: number } =>
        sample.status === 'measured' &&
        typeof sample.timeToUsableMs === 'number' &&
        Number.isFinite(sample.timeToUsableMs)
    )
    .sort((a, b) => b.timeToUsableMs - a.timeToUsableMs);
}

export function blockedRouteReason(
  expectedPath: string,
  finalPath: string,
  reason: string
): string {
  return finalPath !== expectedPath
    ? `Redirected to ${finalPath}; expected ${expectedPath}. ${reason}`
    : reason;
}
