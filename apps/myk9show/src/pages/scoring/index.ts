/**
 * Scoring Pages
 *
 * Entry list and scoresheet pages for judge/secretary scoring.
 * Scoresheet components now live in @myk9/scoring-ui.
 */

// Main pages
export { ScoringEntryListPage } from './ScoringEntryListPage';
export { ScoresheetPage } from './ScoresheetPage';
export { SecretaryScoringPage } from './SecretaryScoringPage';

// Components
export { ScoringEntryCard, SortableScoringEntryCard } from './components/ScoringEntryCard';

// Types
export type { ScoringEntry, ScoringResult, ClassInfo, Organization, SportType } from './types';
export {
  toScoringEntry,
  toClassInfo,
  mapSportType,
  detectScoresheetType,
  toRegistryKey,
  toScoresheetEntry,
  toScoresheetClassInfo,
  toOptimisticScorePayload,
} from './types';
