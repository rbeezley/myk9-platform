import type { ReactNode } from 'react';

interface PhaseShellProps {
  title: string;
  kicker: string;
  /** Right-aligned slot for page-level actions (e.g. the tools sheet button). */
  actions?: ReactNode;
}

// Page-title block shared by the workbench tabs (Setup, Show Desk) so every
// phase page opens with the same kicker + heading rhythm instead of dropping
// straight into same-weight boxes.
export function PhaseShell({ title, kicker, actions }: PhaseShellProps) {
  return (
    <section
      className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-end sm:justify-between"
      aria-label={title}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{kicker}</p>
        <h2 className="break-words text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      {actions && <div className="w-full sm:w-auto sm:shrink-0">{actions}</div>}
    </section>
  );
}
