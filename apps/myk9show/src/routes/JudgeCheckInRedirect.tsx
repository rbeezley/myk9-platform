import { Navigate } from 'react-router-dom';

/**
 * MYK9-850: the old judge check-in dashboard and gate steward screen ran on
 * hard-coded mock data with no nav path in. Send bookmarks to the real,
 * replication-backed ringside surface instead.
 */
export function JudgeCheckInRedirect() {
  return <Navigate to="/at-show" replace />;
}

export default JudgeCheckInRedirect;
