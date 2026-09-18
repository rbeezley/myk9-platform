import { Navigate, useLocation, useParams } from 'react-router-dom';
import type { ShowManagementSectionPath } from './showManagementSections';

interface LegacyShowSectionRedirectProps {
  target: { path: ShowManagementSectionPath; search?: Record<string, string> };
}

/**
 * One old show-section URL -> the tab that absorbed it (MYK9-630 phase 2).
 *
 * The viewer's own search params survive the hop (a deep link into Entry
 * Management carries queue, scope and focus), and the target's own params are
 * layered on top — that is how `/submit-results` becomes `results?step=submit`
 * without Submit Results needing a route of its own.
 */
export function LegacyShowSectionRedirect({ target }: LegacyShowSectionRedirectProps) {
  const { id } = useParams<{ id?: string }>();
  const { search, hash } = useLocation();

  if (!id) return <Navigate to="/shows" replace />;

  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(target.search ?? {})) {
    params.set(key, value);
  }
  const query = params.toString();
  return <Navigate to={`/shows/${id}/${target.path}${query ? `?${query}` : ''}${hash}`} replace />;
}
