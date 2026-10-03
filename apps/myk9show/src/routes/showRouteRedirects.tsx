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
  // `?phase=show-desk` is a legacy query we still honour; Show Desk, then Show
  // Day, is the show home now (MYK9-957), as is the old default, Setup.
  const shouldHonorLegacyShowDeskPhase = !subPath && !params['*'] && legacyPhase === 'show-desk';
  const redirectSubPath = shouldHonorLegacyShowDeskPhase ? '' : (subPath ?? params['*'] ?? '');
  if (shouldHonorLegacyShowDeskPhase) {
    searchParams.delete('phase');
  }
  const nextSearch = searchParams.toString();
  const normalizedSubPath = redirectSubPath ? `/${redirectSubPath.replace(/^\/+/, '')}` : '';
  const normalizedSearch = nextSearch ? `?${nextSearch}` : '';
  return <Navigate to={`/shows/${showId}${normalizedSubPath}${normalizedSearch}`} replace />;
}
