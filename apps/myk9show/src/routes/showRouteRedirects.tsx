import { Navigate, useLocation, useParams } from 'react-router-dom';

interface LegacySecretaryShowRedirectProps {
  subPath?: string;
}

export function LegacySecretaryShowRedirect({ subPath }: LegacySecretaryShowRedirectProps) {
  const params = useParams<{ showId: string; '*': string }>();
  const { showId } = params;
  const { search } = useLocation();

  if (!showId) {
    return <Navigate to="/shows" replace />;
  }

  const redirectSubPath = subPath ?? params['*'] ?? 'setup';
  const normalizedSubPath = redirectSubPath
    ? `/${redirectSubPath.replace(/^\/+/, '')}`
    : '/setup';
  return <Navigate to={`/shows/${showId}${normalizedSubPath}${search}`} replace />;
}
