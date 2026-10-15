import React, { type CSSProperties } from 'react';
import { Outlet, useMatch } from 'react-router-dom';
import { List, PanelLeftClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MasterDetailLayout, MASTER_DETAIL_QUERY } from '@/components/layout/MasterDetailLayout';
import { ShowsPaneList } from '@/components/shows/browse/ShowsPaneList';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useViewPreference } from '@/hooks/useViewPreference';
import { isAccountSession } from '@/hooks/guestServerRead';
import { COCKPIT_SPLIT_VIEWPORT_QUERY } from '@/features/show-map/cockpit/splitViewport';

const PANE_MODES = ['open', 'folded'] as const;
type PaneMode = (typeof PANE_MODES)[number];

// The spike measured a 320px list; dragging stays within a range that leaves the show its width.
const SHOWS_LIST_SIZE = { default: '320px', min: '260px', max: '440px' };
// The fixed header and page padding are the only chrome; each pane scrolls on its own.
const SPLIT_HEIGHT = 'h-[calc(100dvh-var(--app-top-inset,3rem)-2rem)] min-h-[28rem]';
// Inside a pane, the show page's sticky header and tab strip pin to the pane's top, not under the
// app header: every sticky offset there is written against `--app-top-inset`.
const PANE_TOP_INSET = { '--app-top-inset': '0px' } as CSSProperties;

/**
 * The layout route around `/shows` and `/shows/:id/*`. One element for both, so the list stays
 * mounted (scroll, search) while shows open and close.
 *
 * - Signed-out visitors and windows under `lg`: no list, exactly as before (a row tap is a page hop).
 * - From 1280px (the cockpit's own split width): the list beside whatever the route renders
 *   (Find Shows, or the open show). Below it the cockpit would collapse anyway, so the show keeps
 *   its full width (docs/plan-sidebar-browse-pane.md, phase 2, decision (a) from 1280, (b) below).
 * - Between `lg` and 1280px: the same split on `/shows`; with a show open the list folds away
 *   behind a "Shows" button, and the viewer's open/folded choice is remembered.
 */
const ShowsMasterDetailPage: React.FC = () => {
  const { user } = useAuthContext();
  const isWide = useMediaQuery(MASTER_DETAIL_QUERY);
  const isSplitWindow = useMediaQuery(COCKPIT_SPLIT_VIEWPORT_QUERY);
  const showMatch = useMatch('/shows/:id/*');
  const showId = showMatch?.params.id;
  const [paneMode, setPaneMode] = useViewPreference<PaneMode>('shows-pane', 'folded', PANE_MODES);

  if (!isAccountSession(user) || !isWide) return <Outlet />;

  const canFold = !isSplitWindow && !!showId;
  if (canFold && paneMode === 'folded') {
    return (
      <>
        <div className="px-[var(--app-shell-page-padding,1rem)] pt-3 sm:px-6">
          <Button variant="outline" size="sm" onClick={() => setPaneMode('open')}>
            <List className="mr-2 h-4 w-4" aria-hidden="true" />
            Shows
          </Button>
        </div>
        <Outlet />
      </>
    );
  }

  return (
    <div className="px-[var(--app-shell-page-padding,1rem)] py-4 sm:px-6">
      <MasterDetailLayout
        id="shows"
        listLabel="Shows list"
        detailLabel={showId ? 'Show' : 'Find Shows'}
        listSize={SHOWS_LIST_SIZE}
        heightClassName={SPLIT_HEIGHT}
        list={
          <ShowsPaneList
            selectedId={showId}
            headerAction={
              canFold ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Hide shows list"
                  onClick={() => setPaneMode('folded')}
                >
                  <PanelLeftClose className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Hide
                </Button>
              ) : null
            }
          />
        }
        detail={
          <div style={PANE_TOP_INSET}>
            <Outlet />
          </div>
        }
      />
    </div>
  );
};

export default ShowsMasterDetailPage;
