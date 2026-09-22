import type { PremiumStyle } from '@/types/premium-types';
import {
  getPremiumStyleOptions,
  PREMIUM_STYLE_LABELS,
  resolvePremiumStyle,
} from '@/types/premium-types';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

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
    <RadioGroup
      value={resolvePremiumStyle(selectedStyle)}
      onValueChange={value => onSelect(value as PremiumStyle)}
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      aria-label={ariaLabel}
      disabled={disabled}
    >
      {getPremiumStyleOptions()
        .filter(option => !available || available.has(option.value))
        .map(option => {
          const selected = resolvePremiumStyle(selectedStyle) === option.value;
          const id = `premium-style-${option.value}`;
          return (
            <div key={option.value}>
              <RadioGroupItem
                value={option.value}
                id={id}
                aria-labelledby={`${id}-name`}
                className="peer sr-only"
              />
              <Label
                htmlFor={id}
                className={`flex min-h-11 cursor-pointer flex-col rounded-md border p-3 text-left normal-case tracking-normal transition-colors peer-disabled:cursor-not-allowed peer-disabled:opacity-50 ${
                  selected
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                } peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2`}
              >
                <span className="flex items-center gap-2">
                  <span
                    id={`${id}-name`}
                    className={`text-sm font-medium ${selected ? 'text-primary' : ''}`}
                  >
                    {PREMIUM_STYLE_LABELS[option.value]}
                  </span>
                  {selected && <span aria-hidden="true">✓</span>}
                </span>
                <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                  {STYLE_TAGLINES[option.value]}
                </span>
              </Label>
            </div>
          );
        })}
    </RadioGroup>
  );
}
