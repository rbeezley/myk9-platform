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

  const searchParams = new URLSearchParams(search);
  const legacyPhase = searchParams.get('phase');
  const shouldHonorLegacyShowDeskPhase = !subPath && !params['*'] && legacyPhase === 'show-desk';
  const redirectSubPath = shouldHonorLegacyShowDeskPhase
    ? 'show-desk'
    : (subPath ?? params['*'] ?? 'setup');
  if (shouldHonorLegacyShowDeskPhase) {
    searchParams.delete('phase');
  }
  const nextSearch = searchParams.toString();
  const normalizedSubPath = redirectSubPath
    ? `/${redirectSubPath.replace(/^\/+/, '')}`
    : '/setup';
  const normalizedSearch = nextSearch ? `?${nextSearch}` : '';
  return <Navigate to={`/shows/${showId}${normalizedSubPath}${normalizedSearch}`} replace />;
}
