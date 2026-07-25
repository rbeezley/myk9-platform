import { Navigate, useLocation, useParams } from 'react-router-dom';

/**
 * Setup is retained as a compatibility route for old bookmarks and readiness
 * links. Show details now live on the primary Overview; Show Desk owns
 * show-day operations.
 */
export function ShowWorkbenchSetupPage() {
  const { id } = useParams<{ id?: string }>();
  const { search, hash } = useLocation();
  return <Navigate to={id ? `/shows/${id}${search}${hash}` : '/shows'} replace />;
}
