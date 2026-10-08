import type { ReactNode } from 'react';

interface PhaseShellProps {
  title: string;
  /** Right-aligned slot for page-level actions (e.g. the tools sheet button). */
  actions?: ReactNode;
}

// The workbench page's action row. The title names the region and the heading for screen readers
// but is not drawn: the show header above and the tab already say where you are, and a "Your show"
// title with a kicker cost a row of vertical space on every visit.
export function PhaseShell({ title, actions }: PhaseShellProps) {
  return (
    <section
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end"
      aria-label={title}
    >
      <h2 className="sr-only">{title}</h2>
      {actions && <div className="w-full min-w-0 sm:w-auto sm:shrink-0">{actions}</div>}
    </section>
  );
}
