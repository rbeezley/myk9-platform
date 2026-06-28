import type React from 'react';

/**
 * Label printing is routed through the secretary Reports page via the report-type
 * dropdown, but it is a *configurator*, not a letter-page document preview. Without
 * a signal, selecting a label report swaps the calm document preview for a dense
 * config panel under the unchanged "Reports" h1 — which reads as a glitch rather
 * than an intentional mode. These two pieces of chrome name the mode (header) and
 * group the config (section) so the switch reads as deliberate. Secretary intent
 * is "that was easy" (docs/INTENT.md): the copy stays plain and reassuring.
 */

interface LabelModeHeaderProps {
  title: string;
  subtitle: string;
}

/** Mode banner rendered above a label configurator to name the current sub-mode. */
export function LabelModeHeader({ title, subtitle }: LabelModeHeaderProps) {
  return (
    <header className="mx-auto mb-4 w-full max-w-[8.5in]">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </header>
  );
}

interface LabelSetupSectionProps {
  children: React.ReactNode;
}

/**
 * Wraps a label configurator's controls so the dense panel reads as a deliberate
 * "Label setup" group. Replaces the bare `bg-muted/30` panel div the label reports
 * previously used inline, keeping that chrome DRY across Armband + Result labels.
 */
export function LabelSetupSection({ children }: LabelSetupSectionProps) {
  return (
    <section
      aria-label="Label setup"
      className="mb-6 space-y-4 rounded-lg border bg-muted/30 p-4"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Label setup
      </div>
      {children}
    </section>
  );
}
