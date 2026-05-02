import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { buildMermaidGraph, sanitizePath } from '../utils/buildMermaidGraph';
import type { PageEntry } from '../types';

declare global {
  interface Window {
    __myk9FlowNav?: (nodeId: string) => void;
  }
}

interface PageFlowDiagramProps {
  pages: PageEntry[];
}

export function PageFlowDiagram({ pages }: PageFlowDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const graph = buildMermaidGraph(pages);
    if (!graph) return;

    let cancelled = false;
    setRendering(true);
    setRenderError(false);

    // Build path lookup map so the click callback can resolve node ID → path
    const pathMap: Record<string, string> = {};
    for (const page of pages) {
      pathMap[sanitizePath(page.path)] = page.path;
    }

    window.__myk9FlowNav = (nodeId: string) => {
      const path = pathMap[nodeId];
      if (path) navigate(path);
    };

    const id = `myk9-flow-${Date.now()}`;

    // Lazy-load mermaid so it stays out of the main bundle (~150KB saved)
    import('mermaid')
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: 'dark',
          flowchart: { curve: 'basis', useMaxWidth: true, htmlLabels: true },
        });
        return mermaid.render(id, graph);
      })
      .then(({ svg, bindFunctions }) => {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          bindFunctions?.(containerRef.current);
        }
      })
      .catch(() => {
        if (!cancelled) setRenderError(true);
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });

    return () => {
      cancelled = true;
      delete window.__myk9FlowNav;
    };
  }, [pages, navigate]);

  if (pages.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No pages match the current filters.
      </p>
    );
  }

  if (renderError) {
    return (
      <p className="py-12 text-center text-sm text-destructive">
        Failed to render diagram. Check the browser console for details.
      </p>
    );
  }

  return (
    <div className="relative">
      {rendering && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <div ref={containerRef} className={rendering ? 'invisible' : ''} />
    </div>
  );
}
