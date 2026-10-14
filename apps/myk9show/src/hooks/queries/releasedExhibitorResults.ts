import type { ExhibitorResult } from './useExhibitorResults';

/**
 * MYK9-1178: a class's results can still change until the secretary releases
 * it, so title legs and statistics count RELEASED rows only. Past Results keeps
 * the full list and labels the rest "preliminary" (MYK9-805). Both derived
 * hooks read through this one gate.
 */
export function onlyReleasedResults(results: ExhibitorResult[]): ExhibitorResult[] {
  return results.filter(r => !!r.resultsReleasedAt);
}
