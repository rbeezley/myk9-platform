import type { PremiumGeneration } from '../../types/premium-types';

export function detectConsecutiveOverrides(
  generations: Array<Pick<PremiumGeneration, 'fieldOverrides'>>,
  threshold = 3
): string[] {
  const counts: Record<string, number> = {};
  for (const gen of generations) {
    for (const field of Object.keys(gen.fieldOverrides)) {
      counts[field] = (counts[field] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .filter(([, count]) => count >= threshold)
    .map(([field]) => field);
}
