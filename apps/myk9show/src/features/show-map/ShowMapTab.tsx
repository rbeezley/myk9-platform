import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ListTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/common/ErrorState';
import { logger } from '@/services/LoggingService';
import { buildShowMapTree } from './showMapTree';
import { getInitialExpandedNodeIds } from './showMapLayout';
import { ShowMapCanvas, type ShowMapCanvasControls } from './ShowMapCanvas';
import { ShowMapListFallback } from './ShowMapListFallback';
import { ShowMapToolbar } from './ShowMapToolbar';
import type {
  BuildShowMapTreeInput,
  ShowMapFilter,
  ShowMapTree,
} from './showMapTypes';

interface ShowMapTabProps extends BuildShowMapTreeInput {
  canManageShow: boolean;
}

interface ShowMapErrorBoundaryState {
  hasError: boolean;
}

class ShowMapErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  ShowMapErrorBoundaryState
> {
  override state: ShowMapErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ShowMapErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error) {
    logger.warn('Show map graph failed; showing list fallback', 'show-map', {}, error);
  }

  override render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function useExpandedNodes(tree: ShowMapTree) {
  const [expandedNodeIds, setExpandedNodeIds] = useState(() => getInitialExpandedNodeIds(tree));

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodeIds(current => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => setExpandedNodeIds(new Set([tree.root.id])), [tree.root.id]);
  const expandTrials = useCallback(
    () => setExpandedNodeIds(getInitialExpandedNodeIds(tree)),
    [tree]
  );

  return { expandedNodeIds, toggleNode, collapseAll, expandTrials };
}

export default function ShowMapTab({
  show,
  trials,
  classes,
  entries,
  canManageShow,
}: ShowMapTabProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ShowMapFilter>('all');
  const [showList, setShowList] = useState(false);
  const [controls, setControls] = useState<ShowMapCanvasControls | null>(null);
  const tree = useMemo(
    () => buildShowMapTree({ show, trials, classes, entries }),
    [show, trials, classes, entries]
  );
  const { expandedNodeIds, toggleNode, collapseAll, expandTrials } = useExpandedNodes(tree);
  const navigateTo = useCallback((href: string) => navigate(href), [navigate]);

  if (!canManageShow) {
    return <ErrorState message="We couldn't load this map." />;
  }

  if (trials.length === 0) {
    return (
      <div className="rounded-md border bg-card p-6">
        <div className="flex items-start gap-3">
          <ListTree className="mt-1 h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-base font-semibold">No trials yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add trials to start building this show's structure.
            </p>
            <Button
              type="button"
              className="mt-4"
              onClick={() => navigate(`/secretary/create-show/wizard?showId=${show.id}&mode=add-trials`)}
            >
              New Trial
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const fallback = (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        We couldn't load the interactive map. The hierarchy is still available below.
      </div>
      <ShowMapListFallback
        tree={tree}
        expandedNodeIds={expandedNodeIds}
        onToggle={toggleNode}
        onNavigate={navigateTo}
      />
    </div>
  );

  return (
    <div className="mt-4 overflow-hidden rounded-md border bg-background">
      <ShowMapToolbar
        filter={filter}
        onFilterChange={setFilter}
        onFitView={() => controls?.fitView()}
        onZoomIn={() => controls?.zoomIn()}
        onZoomOut={() => controls?.zoomOut()}
        onCollapseAll={collapseAll}
        onExpandTrials={expandTrials}
      />
      <div className="flex justify-end border-b p-3">
        <Button type="button" variant="outline" size="sm" onClick={() => setShowList(v => !v)}>
          {showList ? 'Show map' : 'Show list'}
        </Button>
      </div>
      <div className="p-3">
        {showList ? (
          <ShowMapListFallback
            tree={tree}
            expandedNodeIds={expandedNodeIds}
            onToggle={toggleNode}
            onNavigate={navigateTo}
          />
        ) : (
          <ShowMapErrorBoundary fallback={fallback}>
            <ShowMapCanvas
              tree={tree}
              expandedNodeIds={expandedNodeIds}
              filter={filter}
              onToggle={toggleNode}
              onNavigate={navigateTo}
              onControlsReady={setControls}
            />
          </ShowMapErrorBoundary>
        )}
      </div>
    </div>
  );
}
