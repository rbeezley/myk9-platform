import { Navigate, useLocation } from 'react-router-dom';

/**
 * Legacy `/my-entries` → canonical `/exhibitor/entries`.
 *
 * A bare `<Navigate to="/exhibitor/entries">` would drop the query string and
 * hash, and My Shows reads both: `useResultReveal` opens the result reveal from
 * `?resultEntryId=`, and the waitlist offer dialog opens from `?waitlistOffer=`.
 * An old bookmark or a cached PWA link carrying either would have landed on a
 * plain My Shows with the deep link silently doing nothing, so the search and
 * hash are carried across verbatim.
 */
export function MyEntriesRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: '/exhibitor/entries', search, hash }} replace />;
}
