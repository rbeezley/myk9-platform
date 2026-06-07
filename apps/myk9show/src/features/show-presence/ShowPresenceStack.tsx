/**
 * ShowPresenceStack — the avatar cluster wired to the shared presence roster.
 *
 * Drop it anywhere inside a ShowPresenceProvider; it reads the privacy-filtered
 * roster from context and renders nothing when no one (visible) is here.
 */

import { PresenceStack } from './PresenceStack';
import { useShowPresenceRoster } from './showPresenceContext';

export function ShowPresenceStack(props: { max?: number; className?: string }) {
  const { present } = useShowPresenceRoster();
  // Spread only the props actually passed (exactOptionalPropertyTypes — never
  // forward an explicit `undefined` to PresenceStack's optional props).
  return <PresenceStack present={present} {...props} />;
}
