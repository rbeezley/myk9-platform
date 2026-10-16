import React, { useEffect, useRef, type CSSProperties } from 'react';
import { Outlet, useMatch } from 'react-router-dom';
import { List, PanelLeftClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { MasterDetailLayout, MASTER_DETAIL_QUERY } from '@/components/layout/MasterDetailLayout';
import { readSavedListPercent } from '@/components/layout/masterDetailStorage';
import { ShowsPaneList } from '@/components/shows/browse/ShowsPaneList';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useViewPreference } from '@/hooks/useViewPreference';
import { isAccountSession } from '@/hooks/guestServerRead';
import { UserRole } from '@/types/auth-types';
import { SHOW_MANAGEMENT_SECTIONS } from '@/routes/showManagementSections';
import {
  SHOWS_LIST_DEFAULT_PX,
  SHOWS_LIST_MAX_PX,
  SHOWS_LIST_MIN_PX,
  showsListWidth,
  showsPaneFolds,
  type ShowPaneTab,
} from './showsPaneFold';

const PANE_MODES = ['open', 'folded'] as const;
// The show tabs by path (`showWidthNeeded`); any other path under a show is Overview's.
const PANE_TABS: ReadonlySet<string> = new Set(
  SHOW_MANAGEMENT_SECTIONS.map(section => section.path)
);
type PaneMode = (typeof PANE_MODES)[number];

// The people who run shows. An exhibitor or judge would only get the Find Shows list twice, side by
// side; their own shows list is phase 4 (docs/plan-sidebar-browse-pane.md).
const PANE_ROLES: ReadonlySet<string> = new Set([
  UserRole.SECRETARY,
  UserRole.CLUB_ADMIN,
  UserRole.CHAIRMAN,
  UserRole.STEWARD,
  UserRole.SITE_ADMIN,
]);

// The spike measured a 320px list; dragging stays within a range that leaves the show its width.
const SHOWS_LIST_SIZE = {
  default: `${SHOWS_LIST_DEFAULT_PX}px`,
  min: `${SHOWS_LIST_MIN_PX}px`,
  max: `${SHOWS_LIST_MAX_PX}px`,
};
// The fixed header and page padding are the only chrome; each pane scrolls on its own. Folded,
// the "Shows" button row (2.75rem button + 0.75rem gap) comes off the height too.
const SPLIT_HEIGHT = 'h-[calc(100dvh-var(--app-top-inset,3rem)-2rem)] min-h-[28rem]';
const FOLDED_HEIGHT = 'h-[calc(100dvh-var(--app-top-inset,3rem)-5.5rem)] min-h-[28rem]';
// Inside a pane, the show page's sticky header and tab strip pin to the pane's top, not under the
// app header: every sticky offset there is written against `--app-top-inset`.
const PANE_TOP_INSET = { '--app-top-inset': '0px' } as CSSProperties;

/**
 * The layout route around `/shows` and `/shows/:id/*`. One element for both, so the list stays
 * mounted (scroll, search) while shows open and close.
 *
 * - Signed-out visitors, exhibitors and judges, and windows under `lg`: no list, exactly as before
 *   (a row tap is a page hop).
 * - From `lg`, wherever the show beside the list still gets the cockpit's split
 *   (`showsPaneFolds`, measured on this page's own width): the list beside whatever the route
 *   renders (Find Shows, or the open show).
 * - Narrower than that: the same split on `/shows`; with a show open the list folds away behind a
 *   "Shows" button, so the show keeps its full width, and the viewer's open/folded choice is
 *   remembered. The rule is the same on every show tab, so switching tabs never moves the list.
 *   Where the list fits there is no Hide: a list dragged wider than its default narrows the show,
 *   and the cockpit stacks rather than squeeze until it is dragged back. A remembered "hide even
 *   where it fits" was tried and removed in review: it overrode this rule on every other screen
 *   (docs/plan-sidebar-browse-pane.md, phase 2).
 *
 * The route always renders in the same tree position, so folding, unfolding and crossing the fold
 * width never remount the open show (its forms, scroll and reads survive).
 */
const ShowsMasterDetailPage: React.FC = () => {
  const { user, userWithRoles } = useAuthContext();
  const isWide = useMediaQuery(MASTER_DETAIL_QUERY);
  const showId = useMatch('/shows/:id/*')?.params.id;
  const section = useMatch('/shows/:id/:section/*')?.params.section;
  const tab = PANE_TABS.has(section ?? '') ? (section as ShowPaneTab) : undefined;

  // Roles are null only until RBAC first loads (refreshes keep them), so a cold open of a show URL
  // mounts the show once more when the list arrives; after that the tree position is fixed.
  const runsShows = (userWithRoles?.roles ?? []).some(role => PANE_ROLES.has(role));
  if (!isAccountSession(user) || !runsShows || !isWide) return <Outlet />;
  return <ShowsPaneSplit showId={showId} tab={tab} />;
};

// Its own component so the width is measured from the moment the split mounts, which can be after
// the page's first render (roles arriving, the window crossing `lg`).
function ShowsPaneSplit({ showId, tab }: { showId: string | undefined; tab: ShowPaneTab }) {
  // Measured inside the page padding, on a box whose width folding never changes.
  const { ref: splitRef, width: splitWidth } = useElementWidth<HTMLDivElement>();
  const [paneMode, setPaneMode] = useViewPreference<PaneMode>('shows-pane', 'folded', PANE_MODES);
  const focusAfterToggle = useRef<'list' | 'shows-button' | null>(null);

  // Read each render (a resize, a tab or show change), not on drag: dragging the list wider where
  // it fits narrows the show rather than folding the list out from under the pointer.
  const listWidth =
    splitWidth === null ? undefined : showsListWidth(splitWidth, readSavedListPercent('shows'));
  const canFold = !!showId && showsPaneFolds(splitWidth, tab, listWidth);
  const folded = canFold && paneMode === 'folded';

  // The control that was clicked unmounts on toggle; put focus where the reader now is.
  useEffect(() => {
    const target = focusAfterToggle.current;
    focusAfterToggle.current = null;
    const root = splitRef.current;
    if (!target || !root) return;
    const selector =
      target === 'shows-button'
        ? '[data-shows-pane-toggle]'
        : '[aria-label="Shows list"] a[aria-current="page"], [aria-label="Search the shows list"]';
    root.querySelector<HTMLElement>(selector)?.focus();
  }, [folded, splitRef]);

  const toggle = (next: PaneMode) => {
    focusAfterToggle.current = next === 'open' ? 'list' : 'shows-button';
    setPaneMode(next);
  };

  const hideButton = canFold ? (
    <Button variant="ghost" aria-label="Hide shows list" onClick={() => toggle('folded')}>
      <PanelLeftClose className="mr-1.5 h-4 w-4" aria-hidden="true" />
      Hide
    </Button>
  ) : null;

  return (
    <div className="px-[var(--app-shell-page-padding,1rem)] py-4 sm:px-6">
      <div ref={splitRef}>
        {/* A fixed slot ahead of the split, so showing the button never shifts the split's position. */}
        <div className={folded ? 'pb-3' : 'hidden'}>
          {folded && (
            <Button variant="outline" data-shows-pane-toggle onClick={() => toggle('open')}>
              <List className="mr-2 h-4 w-4" aria-hidden="true" />
              Shows
            </Button>
          )}
        </div>
        <MasterDetailLayout
          id="shows"
          listLabel="Shows list"
          detailLabel={showId ? 'Show' : 'Find Shows'}
          listSize={SHOWS_LIST_SIZE}
          heightClassName={folded ? FOLDED_HEIGHT : SPLIT_HEIGHT}
          listHidden={folded}
          list={
            // A list that fails to render must never take the open show down with it.
            <ErrorBoundary
              level="component"
              context="Shows list"
              fallback={() => (
                <div role="alert" className="space-y-3 rounded-lg border bg-card p-4 text-sm">
                  <p>The shows list couldn&apos;t be shown.</p>
                  {hideButton}
                </div>
              )}
            >
              <ShowsPaneList selectedId={showId} headerAction={hideButton} />
            </ErrorBoundary>
          }
          detail={
            <div style={PANE_TOP_INSET}>
              {/* Mounted only once this page has measured itself (a layout effect, before paint),
                  so the show mounts once, at its final width: a first frame at full width that
                  then narrows would move the rows a returning anchor scrolls to. */}
              {splitWidth !== null && <Outlet />}
            </div>
          }
        />
      </div>
    </div>
  );
}

export default ShowsMasterDetailPage;
