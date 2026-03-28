import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PRESET_INFO } from '@myk9/secretary';
import type { VisibilityPreset } from '@myk9/secretary';

interface OverrideItem {
  id: string;
  label: string;
  presetOverride: VisibilityPreset | null;
  selfCheckinOverride: boolean | null;
}

interface OverrideListProps {
  items: OverrideItem[];
  onPresetChange: (id: string, preset: VisibilityPreset | null) => void;
  onReset: (id: string) => void;
}

export function OverrideList({ items, onPresetChange, onReset }: OverrideListProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No items to configure.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map(item => {
        const hasPresetOverride = item.presetOverride != null;
        const hasCheckinOverride = item.selfCheckinOverride != null;
        const hasAnyOverride = hasPresetOverride || hasCheckinOverride;

        return (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-lg border border-border p-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{item.label}</span>
                <Badge variant={hasAnyOverride ? 'default' : 'secondary'} className="text-xs">
                  {hasAnyOverride ? 'Custom' : 'Inherited'}
                </Badge>
              </div>
            </div>

            <Select
              value={item.presetOverride ?? 'inherit'}
              onValueChange={v =>
                onPresetChange(item.id, v === 'inherit' ? null : (v as VisibilityPreset))
              }
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">Inherit</SelectItem>
                {(['open', 'standard', 'review'] as const).map(p => (
                  <SelectItem key={p} value={p}>
                    {PRESET_INFO[p].title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasAnyOverride && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => onReset(item.id)}
                title="Reset to inherited"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
