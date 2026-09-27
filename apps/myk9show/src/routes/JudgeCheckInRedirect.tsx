import { Navigate } from 'react-router-dom';

/**
 * MYK9-850: the old judge check-in dashboard and gate steward screen ran on
 * hard-coded mock data with no nav path in. `/at-show` has no showId and
 * isn't a registered route (only `/at-show/:showId` is), so send bookmarks
 * to the judge's own assignments dashboard instead.
 */
export function JudgeCheckInRedirect() {
  return <Navigate to="/judge/dashboard" replace />;
}

export default JudgeCheckInRedirect;
