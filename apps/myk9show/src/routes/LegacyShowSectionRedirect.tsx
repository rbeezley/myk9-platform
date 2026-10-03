import { Navigate, useLocation, useParams } from 'react-router-dom';
import { legacySetupToHomeSearch } from '@/pages/secretary/selectClassesRoutes';
import type { LegacyShowSectionTarget } from './showManagementSections';

interface LegacyShowSectionRedirectProps {
  target: LegacyShowSectionTarget;
}

/**
 * One old show-section URL -> the tab that absorbed it (MYK9-630 phase 2;
 * Setup and Show Day -> the show home, MYK9-957).
 *
 * The viewer's own search params survive the hop (a deep link into Entry
 * Management carries queue, scope and focus; a Show Day link carries the
 * cockpit's day, focus and tool), and the target's own params are layered on
 * top -- that is how `/submit-results` becomes `results?step=submit` without
 * Submit Results needing a route of its own.
 */
export function LegacyShowSectionRedirect({ target }: LegacyShowSectionRedirectProps) {
  const { id } = useParams<{ id?: string }>();
  const { search, hash } = useLocation();

  if (!id) return <Navigate to="/shows" replace />;

  const incoming = new URLSearchParams(search);
  const params = target.fromSetup ? legacySetupToHomeSearch(incoming) : incoming;
  for (const [key, value] of Object.entries(target.search ?? {})) {
    params.set(key, value);
  }
  const query = params.toString();
  const path = target.path ? `/shows/${id}/${target.path}` : `/shows/${id}`;
  return <Navigate to={`${path}${query ? `?${query}` : ''}${hash}`} replace />;
}
