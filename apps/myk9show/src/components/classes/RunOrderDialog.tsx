import React, { useState } from 'react';
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
import {
  BASIC_PRESETS,
  COMBINED_PRESET_GROUPS,
  SCOPED_PRESETS,
  type PresetDef,
} from './runOrderPresetDefs';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RunOrderScope = 'all' | string; // 'all' or a specific section value ('A', 'B', …)
export type RenumberMode = 'preserve' | 'renumber';

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

  // Reset selected preset and return to the preset step when scope changes
  // (presets differ per scope; the renumber buttons need a selected preset).
  React.useEffect(() => {
    setSelected(null);
    setStep('presets');
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
  const renderPresetButtons = (defs: PresetDef[]) =>
    defs.map(def => (
      <PresetButton
        key={def.preset}
        def={def}
        selected={selected === def.preset}
        onSelect={() => setSelected(def.preset)}
      />
    ));

  const renderPresets = () => {
    // Single-section scope: simple presets for that section only.
    if (multiSection && scope !== 'all') {
      return <div className="flex flex-col gap-2">{renderPresetButtons(SCOPED_PRESETS)}</div>;
    }
    // Class without A/B sections: one flat list.
    if (!multiSection) {
      return <div className="flex flex-col gap-2">{renderPresetButtons(BASIC_PRESETS)}</div>;
    }
    // Combined A/B class, scope "All": v3's grouped list.
    return (
      <div className="flex flex-col gap-2">
        {COMBINED_PRESET_GROUPS.map(group => (
          <div key={group.label} className="mt-1">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </div>
            <div className="flex flex-col gap-2">{renderPresetButtons(group.presets)}</div>
          </div>
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
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
