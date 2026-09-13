import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface RegistrationWizardShellProps {
  children: React.ReactNode;
  footer: React.ReactNode;
  header: React.ReactNode;
  rootRef: React.RefObject<HTMLDivElement | null>;
  /**
   * The running-entries panel. From `lg` up it is the second grid column and
   * sticks below the header; below `lg` it renders itself as a fixed bottom
   * bar (see `EntriesPanel`), so the slot is a single mount either way.
   * Omitted on the Receipt step, which has nothing left to total.
   */
  aside?: React.ReactNode;
}

/**
 * Structural contract for the registration wizard.
 *
 * The header is sticky inside the page's own scroll context — and the wizard
 * OWNS that context. The app shell's `main` (`SidebarLayout`) is
 * `flex-1 overflow-auto` inside a `flex min-h-screen` row, which makes it a
 * scroll container that never actually scrolls: the document scrolls instead,
 * so a `position: sticky` descendant has no scrollport to stick against and is
 * inert. Rather than change the shell for every page, the full-page wizard
 * bounds itself to the viewport and scrolls itself, which gives the sticky
 * header AND the sticky entries panel a real scrollport.
 *
 * The height subtracts `--app-top-inset` (header, plus the PWA banner when one
 * is showing) because that is the full fixed chrome above this subtree — not
 * `--app-header-height`, which is only what `main` pads by and would leave the
 * wizard a banner's height too tall.
 *
 * BOTH modes, including embedded under /secretary. That route was once left on
 * the app shell's container on the belief that the sidebar pane scrolls; it
 * does not — `main` expands and the document scrolls there too, so sticky boxes
 * scrolled away on long staff steps exactly as they did full-page.
 *
 * The stepper is part of that header, so the content card follows the fully
 * rendered header in normal flow and only uses the shared app-shell gap below
 * it. Step content owns content layout; it must not add margins to compensate
 * for the header.
 *
 * One CSS variable carries a measured chrome height to the things that must
 * clear them, because both heights depend on content (a wrapped breadcrumb, a
 * two-line commit label) and neither can be hard-coded:
 *  - `--registration-header-height`, set here, is what the sticky panel offsets
 *    itself by.
 */
export function RegistrationWizardShell({
  children,
  footer,
  header,
  rootRef,
  aside,
}: RegistrationWizardShellProps) {
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = headerRef.current;
    // Published on the shell ROOT, not on the header: a custom property only
    // inherits downwards, and the panel is the header's cousin, not its child.
    const root = node?.parentElement ?? null;
    if (!node || !root) return;
    const apply = () =>
      root.style.setProperty('--registration-header-height', `${node.offsetHeight}px`);
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      data-layout="registration-wizard-shell"
      data-testid="registration-wizard-shell"
      className={cn(
        'bg-background',
        // min-h-0 so the height is the height, not a floor a tall step can grow
        // past — a grown root would scroll the document again.
        'h-[calc(100dvh-var(--app-top-inset,3rem))] min-h-0 overflow-y-auto'
      )}
    >
      <header
        ref={headerRef}
        data-layout="registration-wizard-header"
        data-testid="registration-wizard-header"
        className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur-xl"
      >
        {header}
      </header>

      <div
        data-layout="registration-wizard-main"
        data-testid="registration-wizard-main"
        className={cn(
          'container mx-auto max-w-7xl px-4 pb-[var(--app-shell-page-bottom,2rem)] pt-[var(--app-shell-page-gap,1.5rem)] sm:px-6',
          // The second column only exists when there is a panel to put in it —
          // the Receipt step would otherwise reserve 320px of nothing.
          // No `items-start`: the panel column must stretch to the row height
          // or the sticky card inside it has nowhere to travel.
          aside && 'lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6'
        )}
      >
        <section
          data-layout="registration-wizard-card"
          data-testid="registration-wizard-card"
          className="flex min-h-[600px] min-w-0 flex-col rounded-2xl border border-border bg-card shadow-sm"
        >
          <div className="flex-1 p-4 sm:p-8">{children}</div>
          <div className="relative px-4 pb-6 sm:px-8 sm:pb-8">{footer}</div>
        </section>
        {aside}
      </div>
    </div>
  );
}
