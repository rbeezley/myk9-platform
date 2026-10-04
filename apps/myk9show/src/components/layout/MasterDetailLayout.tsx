import type { ReactNode } from 'react';
import { useDefaultLayout } from 'react-resizable-panels';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { EmbeddedDetailProvider } from './embeddedDetail';

/** Matches `SecretaryCockpit`'s split breakpoint and Tailwind's `xl`. */
export const MASTER_DETAIL_QUERY = '(min-width: 1280px)';

const PANEL_IDS = ['list', 'detail'];

// localStorage can throw (private window, blocked site data); a lost layout is only cosmetic.
const layoutStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
};

interface MasterDetailLayoutProps {
  /** Unique per entity; the dragged pane sizes are remembered under it. */
  id: string;
  /** The list. Rendered alone, full width, whenever no detail is open. */
  list: ReactNode;
  /** The open record, or null for none. The caller derives it from the route. */
  detail: ReactNode | null;
  listLabel: string;
  detailLabel: string;
}

/**
 * List on the left, open record on the right, with a draggable divider (wide screens only).
 *
 * Below `xl` this is a page hop, exactly as before: the detail replaces the list.
 * The route (not state held here) decides what is open, so deep links, refresh and the back
 * button keep working.
 */
export function MasterDetailLayout({
  id,
  list,
  detail,
  listLabel,
  detailLabel,
}: MasterDetailLayoutProps) {
  const isWide = useMediaQuery(MASTER_DETAIL_QUERY);
  const defaultLayout = useDefaultLayout({
    id: `myk9:master-detail:${id}`,
    panelIds: PANEL_IDS,
    storage: layoutStorage,
  });

  if (!detail) return <>{list}</>;
  if (!isWide) return <>{detail}</>;

  return (
    // The group sets an inline `height: 100%`, which beats a height class on it, so the fixed
    // height lives on this wrapper. Each pane then scrolls on its own inside it.
    <div className="h-[calc(100dvh-14rem)] min-h-[32rem]" data-testid="master-detail-layout">
      <ResizablePanelGroup orientation="horizontal" {...defaultLayout}>
        <ResizablePanel id="list" defaultSize="38%" minSize="26%" maxSize="55%">
          <div role="region" aria-label={listLabel} className="h-full overflow-y-auto pr-1">
            {list}
          </div>
        </ResizablePanel>
        <ResizableHandle aria-label={`Resize ${listLabel} and ${detailLabel}`} />
        <ResizablePanel id="detail" minSize="40%">
          <div role="region" aria-label={detailLabel} className="h-full overflow-y-auto pl-1">
            <EmbeddedDetailProvider value>{detail}</EmbeddedDetailProvider>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
