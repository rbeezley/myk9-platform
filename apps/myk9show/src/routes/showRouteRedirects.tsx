import { Navigate, useLocation, useParams } from 'react-router-dom';

interface LegacySecretaryShowRedirectProps {
  subPath?: string;
}

export function LegacySecretaryShowRedirect({ subPath }: LegacySecretaryShowRedirectProps) {
  const { showId } = useParams<{ showId: string }>();
  const { search } = useLocation();

  if (!showId) {
    return <Navigate to="/shows" replace />;
  }

  const normalizedSubPath = subPath ? `/${subPath.replace(/^\/+/, '')}` : '/setup';
  return <Navigate to={`/shows/${showId}${normalizedSubPath}${search}`} replace />;
}
