import type { HeroParent } from '@/components/common/DetailHero';
import { isAccountSession, type PublicViewerSessionUser } from '@/hooks/guestServerRead';

/**
 * The ONE rule for whether a `DetailHero` parent is a link (MYK9-930, audit M16).
 * A parent the viewer cannot open is plain text, never a link that bounces them to
 * sign-in. The rule mirrors the target route's real guard (routes/publicRoutes.tsx):
 *
 *   show   `/shows/:id`   public: everyone
 *   trial  `/trials/:id`  `<ProtectedRoute accountOnly>`: a signed-in account, not a
 *                         signed-out guest and not a ringside passcode session
 *   club   `/clubs/:id`   public route, but a guest reads it through the public
 *                         directory only, so only an account is linked
 *
 * Add a target here, with its guard, before giving any hero a new parent.
 */
export type HeroParentTarget = 'club' | 'show' | 'trial';

/** `account` is a real signed-in account; `public` is a guest or a passcode session. */
export type HeroViewer = 'account' | 'public';

const PATH: Record<HeroParentTarget, (id: string) => string> = {
  club: id => `/clubs/${id}`,
  show: id => `/shows/${id}`,
  trial: id => `/trials/${id}`,
};

const NEEDS_ACCOUNT: Record<HeroParentTarget, boolean> = {
  club: true,
  show: false,
  trial: true,
};

export function heroViewerFromUser(user: PublicViewerSessionUser): HeroViewer {
  return isAccountSession(user) ? 'account' : 'public';
}

export function heroParentLink({
  target,
  id,
  label,
  viewer,
}: {
  target: HeroParentTarget;
  id: string;
  label: string;
  viewer: HeroViewer;
}): HeroParent {
  if (NEEDS_ACCOUNT[target] && viewer !== 'account') return { label };
  return { label, href: PATH[target](id) };
}
