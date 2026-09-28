import { Navigate } from 'react-router-dom';

/**
 * MYK9-850: the old judge check-in dashboard and gate steward screen ran on
 * hard-coded mock data with no nav path in. The route allowed judges,
 * stewards and site admins, and no single role page admits all three
 * (`/judge/dashboard` is judge/admin only; bare `/at-show` isn't a
 * registered route). `/` is `HomeRedirect`, which already sends every
 * signed-in role to its own home, so bookmarks go there.
 */
export function JudgeCheckInRedirect() {
  return <Navigate to="/" replace />;
}

export default JudgeCheckInRedirect;
