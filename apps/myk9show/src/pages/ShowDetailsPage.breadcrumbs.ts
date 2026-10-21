/**
 * The show workbench's breadcrumbs. A manager came from Manage, not from the Shows list, so the
 * first crumb says so and the rail's current-show item (not Browse) is the lit one beside it
 * (MYK9-1293). Anyone else browsing the show keeps "Shows".
 */
export function showBreadcrumbs(
  canManageShow: boolean,
  showName: string | undefined,
  showId: string | undefined
): { label: string; href: string }[] {
  return [
    canManageShow
      ? { label: 'Manage', href: '/secretary/dashboard' }
      : { label: 'Shows', href: '/shows' },
    { label: showName || 'Show Details', href: `/shows/${showId}` },
  ];
}
