import { Navigate } from 'react-router-dom';

/**
 * The old cross-role results dashboard duplicated show-day and results
 * management surfaces without having a show context. Keep old bookmarks
 * useful by sending them to the canonical show list.
 */
export function ResultsDashboardRedirect() {
  return <Navigate to="/shows" replace />;
}

export default ResultsDashboardRedirect;
