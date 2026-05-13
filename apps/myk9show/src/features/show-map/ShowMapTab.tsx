import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/common/ErrorState';
import { buildShowMapTree, getDefaultExpandedNodeIds } from './showMapTree';
import { ShowMapStructureTable } from './ShowMapStructureTable';
import { ShowMapToolbar } from './ShowMapToolbar';
import type { BuildShowMapTreeInput, ShowMapFilter, ShowMapTree } from './showMapTypes';

interface ShowMapTabProps extends BuildShowMapTreeInput {
  canManageShow: boolean;
}

function useExpandedNodes(tree: ShowMapTree) {
  const [expandedNodeIds, setExpandedNodeIds] = useState(() => getDefaultExpandedNodeIds(tree));

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodeIds(current => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const collapseAll = useCallback(
    () => setExpandedNodeIds(new Set([tree.root.id])),
    [tree.root.id]
  );
  const expandTrials = useCallback(
    () => setExpandedNodeIds(getDefaultExpandedNodeIds(tree)),
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
  const tree = useMemo(
    () => buildShowMapTree({ show, trials, classes, entries }),
    [show, trials, classes, entries]
  );
  const { expandedNodeIds, toggleNode, collapseAll, expandTrials } = useExpandedNodes(tree);
  const navigateTo = useCallback((href: string) => navigate(href), [navigate]);

  if (!canManageShow) {
    return <ErrorState message="Show List is only available to show staff." />;
  }

  if (trials.length === 0) {
    return (
      <div className="rounded-md border bg-card p-6">
        <div className="flex items-start gap-3">
          <ListTree className="mt-1 h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-base font-semibold">No trials yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add trials to start building this show's list.
            </p>
            <Button
              type="button"
              className="mt-4"
              onClick={() =>
                navigate(`/secretary/create-show/wizard?showId=${show.id}&mode=add-trials`)
              }
            >
              New Trial
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-md border bg-background">
      <ShowMapToolbar
        filter={filter}
        onFilterChange={setFilter}
        onCollapseAll={collapseAll}
        onExpandTrials={expandTrials}
      />
      <div className="p-3">
        <ShowMapStructureTable
          tree={tree}
          expandedNodeIds={expandedNodeIds}
          filter={filter}
          onToggle={toggleNode}
          onNavigate={navigateTo}
        />
      </div>
    </div>
  );
}
