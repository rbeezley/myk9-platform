import React, { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EditMode } from './show-creation-wizard-types';
import { getEditModeTitle } from './wizardLabels';

interface WizardHeaderProps {
  editMode: EditMode | undefined;
  onClose: () => void;
}

/**
 * Sticky header with a back button and Secretary / Add Show breadcrumb.
 *
 * The scrollport it sticks against is the DOCUMENT (MYK9-510,
 * docs/adr/011-app-shell-document-scrollport.md), so the offset is the full
 * fixed chrome above it — `--app-top-inset` is the header, plus the PWA
 * install banner when one is showing. At `top-0` this parked underneath the
 * fixed app bar instead of below it.
 *
 * Its own height is published on the page root as
 * `--show-wizard-header-height` so the step indicator below can clear it. The
 * height depends on content (the breadcrumb wraps on a phone), so it cannot be
 * hard-coded. Published on the PARENT because a custom property only inherits
 * downwards and the indicator is this header's sibling, not its child.
 */
export const WizardHeader: React.FC<WizardHeaderProps> = ({ editMode, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    const root = node?.parentElement ?? null;
    if (!node || !root) return;
    const apply = () =>
      root.style.setProperty('--show-wizard-header-height', `${node.offsetHeight}px`);
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-testid="show-creation-wizard-header"
      className="border-b bg-card sticky top-[var(--app-top-inset,3rem)] z-40"
    >
      <div className="container mx-auto px-6 py-4 max-w-7xl">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="gap-2 hover:-translate-y-0.5 transition-all duration-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Secretary</span>
            <span>/</span>
            <span>Add Show</span>
            <span>/</span>
            <span className="text-foreground font-medium">
              {getEditModeTitle(editMode) ?? 'Wizard'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
