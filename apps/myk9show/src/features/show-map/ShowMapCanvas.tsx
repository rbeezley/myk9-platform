import { useEffect, useMemo } from 'react';
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { buildShowMapLayout } from './showMapLayout';
import { ShowMapNode } from './ShowMapNode';
import type { ShowMapFilter, ShowMapTree } from './showMapTypes';

interface ShowMapCanvasProps {
  tree: ShowMapTree;
  expandedNodeIds: Set<string>;
  filter: ShowMapFilter;
  onToggle: (nodeId: string) => void;
  onNavigate?: (href: string) => void;
  onControlsReady: (controls: ShowMapCanvasControls) => void;
}

export interface ShowMapCanvasControls {
  fitView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

const nodeTypes = { showMapNode: ShowMapNode };

function ShowMapCanvasInner({
  tree,
  expandedNodeIds,
  filter,
  onToggle,
  onNavigate,
  onControlsReady,
}: ShowMapCanvasProps) {
  const flow = useReactFlow();
  const layout = useMemo(
    () =>
      buildShowMapLayout(tree, expandedNodeIds, {
        filter,
        onToggle,
        ...(onNavigate ? { onNavigate } : {}),
      }),
    [tree, expandedNodeIds, filter, onToggle, onNavigate]
  );
  const controls = useMemo(
    () => ({
      fitView: () => flow.fitView({ padding: 0.18, duration: 120 }),
      zoomIn: () => flow.zoomIn({ duration: 120 }),
      zoomOut: () => flow.zoomOut({ duration: 120 }),
    }),
    [flow]
  );

  useEffect(() => {
    onControlsReady(controls);
  }, [controls, onControlsReady]);

  return (
    <div className="h-[620px] min-h-[420px] w-full touch-pan-y bg-muted/20">
      <ReactFlow
        nodes={layout.nodes as Node[]}
        edges={layout.edges as Edge[]}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.35}
        maxZoom={1.4}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll={false}
        zoomOnScroll={false}
        panOnDrag={[2]}
      >
        <Background gap={24} size={1} />
      </ReactFlow>
    </div>
  );
}

export function ShowMapCanvas(props: ShowMapCanvasProps) {
  return (
    <ReactFlowProvider>
      <ShowMapCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
