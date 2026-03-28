import { cn } from '@/lib/utils';
import { Eye, Clock, ShieldCheck } from 'lucide-react';
import { PRESET_INFO } from '@myk9/secretary';
import type { VisibilityPreset } from '@myk9/secretary';

const PRESET_ICONS: Record<VisibilityPreset, React.ElementType> = {
  open: Eye,
  standard: Clock,
  review: ShieldCheck,
};

interface PresetSelectorProps {
  value: VisibilityPreset;
  onChange: (preset: VisibilityPreset) => void;
  disabled?: boolean;
}

export function PresetSelector({ value, onChange, disabled }: PresetSelectorProps) {
  const presets: VisibilityPreset[] = ['open', 'standard', 'review'];

  return (
    <div className="grid grid-cols-3 gap-2">
      {presets.map(preset => {
        const info = PRESET_INFO[preset];
        const Icon = PRESET_ICONS[preset];
        const isActive = preset === value;

        return (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => onChange(preset)}
            className={cn(
              'flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-colors',
              'hover:bg-accent/50',
              isActive ? 'ring-2 ring-primary border-primary bg-accent/30' : 'border-border',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <div
              className={cn(
                'size-9 rounded-full flex items-center justify-center',
                isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}
            >
              <Icon size={18} />
            </div>
            <div>
              <div className="font-semibold text-sm">{info.title}</div>
              <div className="text-xs text-muted-foreground leading-tight mt-0.5">
                {info.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
