import type { ReactNode } from 'react';
import { useDefaultLayout } from 'react-resizable-panels';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { EmbeddedDetailProvider } from './embeddedDetail';
import { LIST_PANEL_IDS, layoutKey, layoutStorage } from './masterDetailStorage';

/** Tailwind's `lg`. Below it the pane would be under ~300px once the sidebar takes its share. */
export const MASTER_DETAIL_QUERY = '(min-width: 1024px)';

const DETAIL_ONLY_IDS = ['detail'];

/** The list pane's starting width and drag limits, in any unit the panels accept ("38%", "320px"). */
export interface MasterDetailListSize {
  default: string;
  min: string;
  max: string;
}

const DEFAULT_LIST_SIZE: MasterDetailListSize = { default: '38%', min: '26%', max: '55%' };
const DEFAULT_SPLIT_HEIGHT = 'h-[calc(100dvh-14rem)] min-h-[32rem]';

interface MasterDetailLayoutProps {
  /** Unique per entity; the dragged pane sizes are remembered under it. */
  id: string;
  /** Search and filters. Pinned above the list in the split, so only the rows scroll. */
  listHeader?: ReactNode;
  /** The rows. With `listHeader`, rendered alone, full width, whenever no detail is open. */
  list: ReactNode;
  /** The open record, or null for none. The caller derives it from the route. */
  detail: ReactNode | null;
  listLabel: string;
  detailLabel: string;
  listSize?: MasterDetailListSize;
  /** Height of the split; each pane scrolls on its own inside it. */
  heightClassName?: string;
  /**
   * Fold the list away and give the detail the whole width. The detail stays in the same tree
   * position, so folding and unfolding never remounts it.
   */
  listHidden?: boolean;
}

/**
 * List on the left, open record on the right, with a draggable divider (wide screens only).
 *
 * Below `lg` this is a page hop, exactly as before: the detail replaces the list.
 * The route (not state held here) decides what is open, so deep links, refresh and the back
 * button keep working.
 */
export function MasterDetailLayout({
  id,
  listHeader,
  list,
  detail,
  listLabel,
  detailLabel,
  listSize = DEFAULT_LIST_SIZE,
  heightClassName = DEFAULT_SPLIT_HEIGHT,
  listHidden = false,
}: MasterDetailLayoutProps) {
  const isWide = useMediaQuery(MASTER_DETAIL_QUERY);
  const defaultLayout = useDefaultLayout({
    id: layoutKey(id),
    panelIds: listHidden ? DETAIL_ONLY_IDS : LIST_PANEL_IDS,
    storage: layoutStorage,
  });

  if (!detail) {
    return (
      <div className="space-y-6">
        {listHeader}
        {list}
      </div>
    );
  }
  if (!isWide) return <>{detail}</>;

  return (
    // The group sets an inline `height: 100%`, which beats a height class on it, so the fixed
    // height lives on this wrapper. Each pane then scrolls on its own inside it.
    // Position the scrollers so absolute children (including sr-only labels) stay contained
    // instead of extending the document and letting the whole workspace scroll out of view.
    <div className={heightClassName} data-testid="master-detail-layout">
      <ResizablePanelGroup orientation="horizontal" {...defaultLayout}>
        {/* Fixed slots (false when folded), so the detail panel keeps its position. */}
        {!listHidden && (
          <ResizablePanel
            id="list"
            defaultSize={listSize.default}
            minSize={listSize.min}
            maxSize={listSize.max}
          >
            <div role="region" aria-label={listLabel} className="flex h-full flex-col pr-1">
              {listHeader && <div className="shrink-0 pb-3">{listHeader}</div>}
              <div className="relative min-h-0 flex-1 overflow-y-auto">{list}</div>
            </div>
          </ResizablePanel>
        )}
        {!listHidden && <ResizableHandle aria-label={`Resize ${listLabel} and ${detailLabel}`} />}
        <ResizablePanel id="detail" minSize="40%">
          <div
            role="region"
            aria-label={detailLabel}
            className="relative h-full overflow-y-auto pl-1"
          >
            <EmbeddedDetailProvider value>{detail}</EmbeddedDetailProvider>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
