/**
 * Onboarding Step 3 - Mailing Address (optional)
 * Collects street, city, state, zip. Skippable.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface AddressData {
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface StepAddressProps {
  data: AddressData;
  onChange: (data: AddressData) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function StepAddress({ data, onChange, onNext, onBack, onSkip }: StepAddressProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="step-address">
      <div>
        <h2 className="text-xl font-semibold">Mailing address</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Used for premium ribbons and awards shipped after events. Completely optional.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="ob-street">Street address</Label>
        <Input
          id="ob-street"
          value={data.street}
          onChange={e => onChange({ ...data, street: e.target.value })}
          placeholder="123 Main St"
          autoComplete="street-address"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1 col-span-2 sm:col-span-1">
          <Label htmlFor="ob-city">City</Label>
          <Input
            id="ob-city"
            value={data.city}
            onChange={e => onChange({ ...data, city: e.target.value })}
            placeholder="Springfield"
            autoComplete="address-level2"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ob-state">State</Label>
          <Input
            id="ob-state"
            value={data.state}
            onChange={e => onChange({ ...data, state: e.target.value })}
            placeholder="CA"
            maxLength={2}
            autoComplete="address-level1"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="ob-zip">ZIP code</Label>
        <Input
          id="ob-zip"
          value={data.zip}
          onChange={e => onChange({ ...data, zip: e.target.value })}
          placeholder="90210"
          autoComplete="postal-code"
        />
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
          <Button type="submit">Next</Button>
        </div>
      </div>
    </form>
  );
}
