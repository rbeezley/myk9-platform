import React, { useState } from 'react';
import { ArrowUpDown, Shuffle, GripVertical } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hasMultipleSections } from '@/lib/runOrderUtils';
import type { RunOrderPreset, RunOrderEntry } from '@/lib/runOrderUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RunOrderScope = 'all' | string; // 'all' or a specific section value ('A', 'B', …)
export type RenumberMode = 'preserve' | 'renumber';

interface PresetDef {
  preset: RunOrderPreset;
  label: string;
  description: string;
  icon: React.ReactNode;
}

interface RunOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Full entry list — used to detect A/B sections. */
  entries: RunOrderEntry[];
  onApply: (
    preset: RunOrderPreset,
    scope?: RunOrderScope,
    renumberMode?: RenumberMode
  ) => Promise<void>;
}

// ─── Preset definitions ───────────────────────────────────────────────────────

const BASIC_PRESETS: PresetDef[] = [
  {
    preset: 'armband-asc',
    label: 'Armband Low to High',
    description: 'Sort entries by armband number (ascending)',
    icon: <ArrowUpDown className="h-5 w-5" />,
  },
  {
    preset: 'armband-desc',
    label: 'Armband High to Low',
    description: 'Sort entries by armband number (descending)',
    icon: <ArrowUpDown className="h-5 w-5" />,
  },
  {
    preset: 'random',
    label: 'Random Shuffle',
    description: 'Completely randomize entry order',
    icon: <Shuffle className="h-5 w-5" />,
  },
  {
    preset: 'manual',
    label: 'Manual Drag and Drop',
    description: 'Manually reorder entries by dragging',
    icon: <GripVertical className="h-5 w-5" />,
  },
];

interface SectionPresetGroup {
  label: string;
  presets: PresetDef[];
}

const SECTION_PRESET_GROUPS: SectionPresetGroup[] = [
  {
    label: 'Section A then B',
    presets: [
      {
        preset: 'a-then-b-asc',
        label: 'Armband Low to High',
        description: 'A section first (ascending), then B section (ascending)',
        icon: <ArrowUpDown className="h-5 w-5" />,
      },
      {
        preset: 'a-then-b-desc',
        label: 'Armband High to Low',
        description: 'A section first (descending), then B section (descending)',
        icon: <ArrowUpDown className="h-5 w-5" />,
      },
    ],
  },
  {
    label: 'Section B then A',
    presets: [
      {
        preset: 'b-then-a-asc',
        label: 'Armband Low to High',
        description: 'B section first (ascending), then A section (ascending)',
        icon: <ArrowUpDown className="h-5 w-5" />,
      },
      {
        preset: 'b-then-a-desc',
        label: 'Armband High to Low',
        description: 'B section first (descending), then A section (descending)',
        icon: <ArrowUpDown className="h-5 w-5" />,
      },
    ],
  },
  {
    label: 'Random (within sections)',
    presets: [
      {
        preset: 'random-sections',
        label: 'Random Shuffle (within sections)',
        description: 'Randomize A section, then randomize B section',
        icon: <Shuffle className="h-5 w-5" />,
      },
    ],
  },
];

// Scoped presets: applied to a single section only
const SCOPED_PRESETS: PresetDef[] = [
  {
    preset: 'armband-asc',
    label: 'Armband Low to High',
    description: 'Sort this section by armband (ascending)',
    icon: <ArrowUpDown className="h-5 w-5" />,
  },
  {
    preset: 'armband-desc',
    label: 'Armband High to Low',
    description: 'Sort this section by armband (descending)',
    icon: <ArrowUpDown className="h-5 w-5" />,
  },
  {
    preset: 'random',
    label: 'Random Shuffle',
    description: 'Randomly shuffle this section',
    icon: <Shuffle className="h-5 w-5" />,
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function PresetButton({
  def,
  selected,
  onSelect,
}: {
  def: PresetDef;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      key={def.preset}
      type="button"
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent',
        selected ? 'border-primary bg-accent' : 'border-border bg-background'
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {def.icon}
      </div>
      <div>
        <div className="text-sm font-medium">{def.label}</div>
        <div className="text-xs text-muted-foreground">{def.description}</div>
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type DialogStep = 'presets' | 'renumber';

export const RunOrderDialog: React.FC<RunOrderDialogProps> = ({
  open,
  onOpenChange,
  entries,
  onApply,
}) => {
  const [selected, setSelected] = useState<RunOrderPreset | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [scope, setScope] = useState<RunOrderScope>('all');
  const [step, setStep] = useState<DialogStep>('presets');

  const multiSection = hasMultipleSections(entries);

  // Derive distinct section values present in entries (e.g. ['A', 'B'])
  const sectionValues = React.useMemo(() => {
    const set = new Set(
      entries.map(e => e.section).filter((s): s is string => s != null && s !== '')
    );
    return [...set].sort();
  }, [entries]);

  React.useEffect(() => {
    if (open) {
      setSelected(null);
      setIsApplying(false);
      setScope('all');
      setStep('presets');
    }
  }, [open]);

  // Reset selected preset when scope changes (presets differ per scope)
  React.useEffect(() => {
    setSelected(null);
  }, [scope]);

  const handleOpenChange = (next: boolean) => {
    if (isApplying) return;
    onOpenChange(next);
  };

  const handleApply = async () => {
    if (!selected) return;

    if (selected === 'manual') {
      // manual: just close — the hook treats 'manual' as a no-op
      setIsApplying(true);
      try {
        await onApply(selected, scope);
        onOpenChange(false);
      } catch {
        // error toast shown by the hook
      } finally {
        setIsApplying(false);
      }
      return;
    }

    // Single-section scope: show renumber step first
    if (scope !== 'all' && step === 'presets') {
      setStep('renumber');
      return;
    }

    setIsApplying(true);
    try {
      await onApply(selected, scope);
      onOpenChange(false);
    } catch {
      // error toast shown by the hook
    } finally {
      setIsApplying(false);
    }
  };

  const handleApplyWithRenumberMode = async (mode: RenumberMode) => {
    if (!selected) return;
    setIsApplying(true);
    try {
      await onApply(selected, scope, mode);
      onOpenChange(false);
    } catch {
      // error toast shown by the hook
    } finally {
      setIsApplying(false);
    }
  };

  const entryCount =
    scope === 'all' ? entries.length : entries.filter(e => e.section === scope).length;

  const scopeLabel = scope === 'all' ? '' : `Section ${scope} `;
  const otherSectionLabel =
    scope !== 'all' && sectionValues.length === 2
      ? `Section ${sectionValues.find(s => s !== scope) ?? ''}`
      : 'other sections';

  // ── Scope picker (shown only for multi-section classes) ────────────────────
  const renderScopePicker = () => {
    if (!multiSection) return null;

    return (
      <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setScope('all')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            scope === 'all'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          All (A &amp; B)
        </button>
        {sectionValues.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              scope === s
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Section {s}
          </button>
        ))}
      </div>
    );
  };

  // ── Preset list ─────────────────────────────────────────────────────────────
  const renderPresets = () => {
    if (!multiSection || scope === 'all') {
      // Non-section class OR all-scope: show basic presets.
      // For multi-section "all" scope, also show section preset groups.
      return (
        <div className="flex flex-col gap-2">
          {/* Basic presets always visible */}
          {BASIC_PRESETS.map(def => (
            <PresetButton
              key={def.preset}
              def={def}
              selected={selected === def.preset}
              onSelect={() => setSelected(def.preset)}
            />
          ))}

          {/* Section preset groups — only when multiple sections exist */}
          {multiSection &&
            SECTION_PRESET_GROUPS.map(group => (
              <div key={group.label} className="mt-3">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </div>
                <div className="flex flex-col gap-2">
                  {group.presets.map(def => (
                    <PresetButton
                      key={def.preset}
                      def={def}
                      selected={selected === def.preset}
                      onSelect={() => setSelected(def.preset)}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      );
    }

    // Single-section scope: only simple presets
    return (
      <div className="flex flex-col gap-2">
        {SCOPED_PRESETS.map(def => (
          <PresetButton
            key={def.preset}
            def={def}
            selected={selected === def.preset}
            onSelect={() => setSelected(def.preset)}
          />
        ))}
      </div>
    );
  };

  // ── Renumber step ────────────────────────────────────────────────────────────
  const renderRenumberStep = () => (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        You are reordering <strong>Section {scope}</strong> entries. What should happen to{' '}
        <strong>{otherSectionLabel}</strong>?
      </p>
      <button
        type="button"
        onClick={() => handleApplyWithRenumberMode('preserve')}
        disabled={isApplying}
        className="flex flex-col gap-0.5 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent disabled:opacity-50"
      >
        <span className="text-sm font-medium">Preserve {otherSectionLabel}</span>
        <span className="text-xs text-muted-foreground">
          Only renumber Section {scope} entries. {otherSectionLabel} keeps its current run order.
        </span>
      </button>
      <button
        type="button"
        onClick={() => handleApplyWithRenumberMode('renumber')}
        disabled={isApplying}
        className="flex flex-col gap-0.5 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent disabled:opacity-50"
      >
        <span className="text-sm font-medium">Renumber all</span>
        <span className="text-xs text-muted-foreground">
          Section {scope} runs first (1, 2, 3…), then {otherSectionLabel} continues.
        </span>
      </button>
      {isApplying && <p className="text-sm text-muted-foreground">Applying…</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Run Order</DialogTitle>
        </DialogHeader>

        {renderScopePicker()}

        {step === 'presets' ? (
          <>
            <p className="text-sm text-muted-foreground">
              Choose how to order the {entryCount} {scopeLabel}
              {entryCount === 1 ? 'entry' : 'entries'}
              {scope === 'all' ? ' in this class' : ''}:
            </p>
            {renderPresets()}
          </>
        ) : (
          renderRenumberStep()
        )}

        {step === 'presets' && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isApplying}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={!selected || isApplying}>
              {isApplying
                ? 'Applying...'
                : scope !== 'all' && selected !== 'manual'
                  ? 'Next'
                  : 'Apply'}
            </Button>
          </DialogFooter>
        )}

        {step === 'renumber' && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep('presets')} disabled={isApplying}>
              Back
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
