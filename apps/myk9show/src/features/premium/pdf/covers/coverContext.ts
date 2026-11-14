import type { GeneratedPremium } from '../../../../types/premium-types';
import type { StyleTokens } from '../pdfStyles';
import type { PremiumFacts } from '../../premiumFacts';

export interface CoverContext {
  t: StyleTokens;
  data: GeneratedPremium;
  /** The premium's one list of facts; covers arrange these, they do not recompute them. */
  facts: PremiumFacts;
  dateRange: string;
  club: string;
  venue: string;
  org: string;
  monogram: string;
}
