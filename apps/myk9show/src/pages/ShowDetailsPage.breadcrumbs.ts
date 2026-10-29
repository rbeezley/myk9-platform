/**
 * The show workbench's breadcrumbs. A manager came from Home, not from the Shows list, so the
 * first crumb says so and the rail's current-show item (not Browse) is the lit one beside it
 * (MYK9-1293). Anyone else browsing the show keeps "Shows".
 *
 * Whether the viewer manages the show is unknown until the show (its club) has loaded, so until
 * then there is no first crumb: it would otherwise read "Shows", then flip to "Home".
 */
export function showBreadcrumbs(
  canManageShow: boolean,
  show: { name: string } | null | undefined,
  showId: string | undefined
): { label: string; href: string }[] {
  const showCrumb = { label: show?.name || 'Show Details', href: `/shows/${showId}` };
  if (!show) return [showCrumb];
  return [
    canManageShow
      ? { label: 'Home', href: '/secretary/dashboard' }
      : { label: 'Shows', href: '/shows' },
    showCrumb,
  ];
}
