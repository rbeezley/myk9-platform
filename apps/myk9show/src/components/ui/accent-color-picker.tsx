import { useMemo } from 'react';
import { Ban, Check } from 'lucide-react';
import { PRESET_COLORS, generatePalette } from '../../lib/branding';

interface AccentColorPickerProps {
  value: string | null;
  onChange: (color: string | null) => void;
}

export function AccentColorPicker({ value, onChange }: AccentColorPickerProps) {
  const palette = useMemo(() => (value ? generatePalette(value) : null), [value]);

  return (
    <div>
      <label className="mb-3 block text-sm font-semibold uppercase tracking-wider text-slate-400">
        Brand Color
      </label>
      <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Brand color">
        {/* None option */}
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          aria-label="None"
          onClick={() => onChange(null)}
          className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 transition-all ${
            value === null
              ? 'border-slate-400 ring-2 ring-slate-400/30'
              : 'border-transparent hover:border-slate-600'
          }`}
          style={{ background: '#1a1a2e' }}
        >
          <Ban className="h-4 w-4 text-slate-500" />
        </button>

        {/* Preset swatches */}
        {PRESET_COLORS.map(color => (
          <button
            key={color.hex}
            type="button"
            role="radio"
            aria-checked={value === color.hex}
            aria-label={color.name}
            onClick={() => onChange(color.hex)}
            className={`relative h-9 w-9 rounded-lg border-2 transition-all ${
              value === color.hex
                ? 'border-white/60 ring-2 ring-white/20'
                : 'border-transparent hover:border-white/30'
            }`}
            style={{ backgroundColor: color.hex }}
          >
            {value === color.hex && (
              <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow-md" />
            )}
          </button>
        ))}
      </div>

      {/* Live preview strip */}
      {palette && (
        <div className="mt-4 border-t border-white/5 pt-4" data-testid="color-preview">
          <label className="mb-2 block text-xs text-slate-500">PREVIEW</label>
          <div
            className="h-12 rounded-lg"
            style={{
              background: `linear-gradient(135deg, ${palette.primaryDark}, ${palette.primary}, ${palette.primaryLight})`,
              borderTop: `3px solid ${palette.primary}`,
            }}
          />
        </div>
      )}
    </div>
  );
}
