import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CurrencyInputProps extends Omit<
  React.ComponentProps<'input'>,
  'type' | 'value' | 'onChange'
> {
  value: number | string | undefined;
  onChange: (value: number) => void;
}

/**
 * Currency input with "$" prefix and auto-formatting to 2 decimal places on blur.
 * Stores the numeric value internally but displays formatted currency.
 */
const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, className, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState('');
    const isFocusedRef = React.useRef(false);

    // Sync display value from prop when not focused
    React.useEffect(() => {
      if (!isFocusedRef.current) {
        const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
        setDisplayValue(num > 0 ? num.toFixed(2) : '');
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Allow empty, digits, and one decimal point
      if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
        setDisplayValue(raw);
        onChange(parseFloat(raw) || 0);
      }
    };

    const handleFocus = () => {
      isFocusedRef.current = true;
      // Show raw number for editing (strip trailing zeros for cleaner editing)
      const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
      setDisplayValue(num > 0 ? String(num) : '');
    };

    const handleBlur = () => {
      isFocusedRef.current = false;
      const num = parseFloat(displayValue) || 0;
      onChange(num);
      // useEffect will sync displayValue from the updated prop
    };

    return (
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground pointer-events-none">
          $
        </span>
        <Input
          ref={ref}
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={cn('pl-7', className)}
          {...props}
        />
      </div>
    );
  }
);
CurrencyInput.displayName = 'CurrencyInput';

export { CurrencyInput };
