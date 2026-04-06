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
import type { RunOrderPreset } from '@/lib/runOrderUtils';

interface RunOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryCount: number;
  onApply: (preset: RunOrderPreset) => Promise<void>;
}

const PRESETS: {
  preset: RunOrderPreset;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
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

export const RunOrderDialog: React.FC<RunOrderDialogProps> = ({
  open,
  onOpenChange,
  entryCount,
  onApply,
}) => {
  const [selected, setSelected] = useState<RunOrderPreset | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  React.useEffect(() => {
    if (open) setSelected(null);
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (isApplying) return;
    onOpenChange(next);
  };

  const handleApply = async () => {
    if (!selected) return;
    setIsApplying(true);
    try {
      await onApply(selected);
      onOpenChange(false);
    } catch {
      // error toast already shown by the hook
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Run Order</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Choose how to order the {entryCount} {entryCount === 1 ? 'entry' : 'entries'} in this
          class:
        </p>

        <div className="flex flex-col gap-2">
          {PRESETS.map(({ preset, label, description, icon }) => (
            <button
              key={preset}
              type="button"
              onClick={() => setSelected(preset)}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent',
                selected === preset ? 'border-primary bg-accent' : 'border-border bg-background'
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                {icon}
              </div>
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">{description}</div>
              </div>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isApplying}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!selected || isApplying}>
            {isApplying ? 'Applying...' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
