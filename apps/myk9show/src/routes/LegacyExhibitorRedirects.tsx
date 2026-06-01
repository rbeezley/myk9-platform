import { Navigate, useLocation } from 'react-router-dom';
import { useShowStore } from '@/store/showStore';
import { getLegacyShowDayRedirectTarget } from './LegacyExhibitorRedirects.helpers';

export function LegacyShowDayRedirect() {
  const { search } = useLocation();
  const selectedShowId = useShowStore(s => s.selectedShowId);
  return <Navigate to={getLegacyShowDayRedirectTarget(search, selectedShowId)} replace />;
}

export function LegacyCheckInRedirect() {
  return <Navigate to="/exhibitor/entries" replace />;
}
