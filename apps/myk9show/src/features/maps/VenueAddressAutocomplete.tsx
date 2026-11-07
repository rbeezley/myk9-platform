import { Textarea } from '@/components/ui/textarea';

interface VenueAddressAutocompleteProps {
  id: string;
  value: string;
  /** Fires on every keystroke. */
  onChange: (location: string) => void;
  /**
   * Fires when focus leaves the field (MYK9-686 auto-locate: the caller
   * geocodes the typed address through Nominatim and places the pin).
   */
  onSettledBlur?: (() => void) | undefined;
  placeholder?: string;
  rows?: number;
  'aria-invalid'?: boolean | undefined;
  'aria-describedby'?: string | undefined;
}

/**
 * Venue address field: a plain textarea. The pin is placed by the existing
 * Nominatim lookup (Locate address button, or on blur via onSettledBlur).
 * No third-party suggestions and no API key.
 */
export function VenueAddressAutocomplete({
  id,
  value,
  onChange,
  onSettledBlur,
  placeholder,
  rows = 3,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: VenueAddressAutocompleteProps) {
  return (
    <Textarea
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={() => onSettledBlur?.()}
      placeholder={placeholder}
      rows={rows}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      className="border border-border bg-input rounded-md"
    />
  );
}
