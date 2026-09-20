import type { PremiumStyle } from '@/types/premium-types';
import {
  getPremiumStyleOptions,
  PREMIUM_STYLE_LABELS,
  resolvePremiumStyle,
} from '@/types/premium-types';

const STYLE_TAGLINES: Record<PremiumStyle, string> = {
  monogram: 'Centered TC monogram, large serif title - conservative classic.',
  banner: 'Black bar across top, left-aligned title - clean and direct.',
  headline: 'Stacked header with double-rule divider - quietly bold.',
  magazine: 'Editorial spread - display serif cover, pull quotes inside.',
  poster: 'Bold single-page hero - tight uppercase, ink-blot accents.',
  gazette: 'Newspaper broadsheet - masthead, multi-column body.',
  fieldGuide: 'Utility reference - section-numbered sections, dense data tables.',
  heritage: 'Traditional kennel club - ivory paper, ornamental rules.',
};

export interface PremiumStyleSelectorProps {
  selectedStyle: PremiumStyle;
  onSelect: (style: PremiumStyle) => void;
  availableStyles?: readonly PremiumStyle[];
  ariaLabel?: string;
  disabled?: boolean;
}

/** Shared style catalog and selector used by editing and public preview surfaces. */
export function PremiumStyleSelector({
  selectedStyle,
  onSelect,
  availableStyles,
  ariaLabel = 'Show experience style',
  disabled = false,
}: PremiumStyleSelectorProps) {
  const available = availableStyles ? new Set(availableStyles) : null;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={ariaLabel}>
      {getPremiumStyleOptions()
        .filter(option => !available || available.has(option.value))
        .map(option => {
          const selected = resolvePremiumStyle(selectedStyle) === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={PREMIUM_STYLE_LABELS[option.value]}
              disabled={disabled}
              onClick={() => onSelect(option.value)}
              className={`min-h-11 rounded-md border p-3 text-left transition-colors ${
                selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`text-sm font-medium ${selected ? 'text-primary' : ''}`}>
                  {PREMIUM_STYLE_LABELS[option.value]}
                </span>
                {selected && <span aria-hidden="true">✓</span>}
              </span>
              <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                {STYLE_TAGLINES[option.value]}
              </span>
            </button>
          );
        })}
    </div>
  );
}
