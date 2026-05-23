import type { ReactNode } from 'react';
import { hasAnyWrapUpEligibleNode } from './showDeskStatus';
import type { ShowMapTree } from './showMapTypes';

interface ShowDeskCloseoutSectionProps {
  tree: ShowMapTree;
  children: ReactNode;
}

// INTENT: Phase B4 — wrap-up surfaces (reconciliation, incident closeout,
// results control / reports / submit links) render at the bottom of Show
// Desk ONLY when at least one class is wrap-up-eligible. Mid-day, before
// any class enters wrap-up, this section is absent entirely — keeps the
// surface calm rather than parking dead links the secretary can't act on.
//
// The section is a pure container — the caller (ShowWorkbenchPage)
// composes the actual closeout cards as children, mirroring the pattern
// used by ShowDeskToolsSheet's toolsContent. This component never needs
// to know about entries, incident state, or the destination routes.
export function ShowDeskCloseoutSection({ tree, children }: ShowDeskCloseoutSectionProps) {
  if (!hasAnyWrapUpEligibleNode(tree)) return null;

  return (
    <section
      className="space-y-4 border-t pt-6"
      aria-labelledby="show-desk-closeout-title"
      data-testid="show-desk-closeout-section"
    >
      <div>
        <h2 id="show-desk-closeout-title" className="text-lg font-semibold tracking-tight">
          Closeout
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review results, reconcile attendance, and submit final files for completed classes.
        </p>
      </div>
      {children}
    </section>
  );
}
