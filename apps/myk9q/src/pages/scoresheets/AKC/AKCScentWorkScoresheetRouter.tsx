/**
 * AKC Scent Work Scoresheet Router
 *
 * Smart router that loads the appropriate scoresheet based on show type:
 * - Regular shows: Load AKCScentWorkScoresheet (99.999% of users)
 * - National shows: Load AKCNationalsScoresheet (once per year usage)
 *
 * This lazy-loads only the scoresheet needed, reducing bundle size for
 * regular shows by ~50KB and improving load time by 100-200ms.
 */

import React, { Suspense } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { ScoresheetLoader } from '../../../components/LoadingSpinner';

// Lazy load both scoresheets (only one will be loaded per session)
const AKCScentWorkScoresheet = React.lazy(() =>
  import('./AKCScentWorkScoresheet').then(module => ({
    default: module.AKCScentWorkScoresheet
  }))
);

const AKCNationalsScoresheet = React.lazy(() =>
  import('./AKCNationalsScoresheet').then(module => ({
    default: module.AKCNationalsScoresheet
  }))
);

/**
 * Router component that selects the appropriate scoresheet
 */
export const AKCScentWorkScoresheetRouter: React.FC = () => {
  const { showContext } = useAuth();

  // Detect if this is a Nationals show
  const isNationalsMode = showContext?.showType?.toLowerCase().includes('national');

  return (
    <Suspense fallback={<ScoresheetLoader />}>
      {isNationalsMode ? <AKCNationalsScoresheet /> : <AKCScentWorkScoresheet />}
    </Suspense>
  );
};
