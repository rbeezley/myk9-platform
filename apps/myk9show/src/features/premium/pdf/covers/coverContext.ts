import type { GeneratedPremium } from '../../../../types/premium-types';
import type { StyleTokens } from '../pdfStyles';

export interface CoverContext {
  t: StyleTokens;
  data: GeneratedPremium;
  dateRange: string;
  club: string;
  venue: string;
  org: string;
  monogram: string;
}
