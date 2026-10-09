/**
 * Onboarding Step 1 - Profile
 * Collects name, phone and mailing address. Required step.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ownerAddressMissingParts } from '@/features/registration/ownerAddress';

export interface ProfileData {
  firstName: string;
  lastName: string;
  phone: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
}

interface StoredPerson {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}

/** The step's starting values: the stored person, else what signup put in user metadata. */
export function profileDataFromPerson(
  person: StoredPerson | undefined,
  userMeta: Record<string, unknown>
): ProfileData {
  const meta = (key: string) =>
    typeof userMeta[key] === 'string' ? (userMeta[key] as string) : '';
  return {
    firstName: person?.first_name || meta('first_name') || meta('firstName'),
    lastName: person?.last_name || meta('last_name') || meta('lastName'),
    phone: person?.phone || meta('phone'),
    streetAddress: person?.street_address ?? '',
    city: person?.city ?? '',
    state: person?.state ?? '',
    zipCode: person?.zip_code ?? '',
  };
}

/**
 * True only when the person row was read and its address is incomplete. An
 * unread person (`undefined`) is unknown, never "missing" (MYK9-347).
 */
export function personNeedsAddress(person: StoredPerson | undefined): boolean {
  if (!person) return false;
  return missingAddressMessage(profileDataFromPerson(person, {})) !== '';
}

/**
 * The address is required: registries such as AKC print the owner's address on
 * every entry in the official marked catalog (MYK9-1010). Returns the message
 * naming what is missing, or '' when the address is complete.
 */
export function missingAddressMessage(data: ProfileData): string {
  const missing = ownerAddressMissingParts(data);
  if (missing.length === 0) return '';
  return `Please enter your ${missing.join(', ')}.`;
}

interface StepProfileProps {
  data: ProfileData;
  email: string;
  onChange: (data: ProfileData) => void;
  onNext: () => void;
  isSubmitting: boolean;
  error: string;
}

export function StepProfile({
  data,
  email,
  onChange,
  onNext,
  isSubmitting,
  error,
}: StepProfileProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    // noValidate: the page's plain-language message names every missing field at
    // once; native validation would show a tooltip for only the first one.
    <form onSubmit={handleSubmit} noValidate className="space-y-4" data-testid="step-profile">
      <div>
        <h2 className="text-xl font-semibold">Tell us about yourself</h2>
        <p className="text-sm text-muted-foreground mt-1">
          This information will appear on your show entries and registrations.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="ob-firstName">First name *</Label>
          <Input
            id="ob-firstName"
            value={data.firstName}
            onChange={e => onChange({ ...data, firstName: e.target.value })}
            placeholder="First"
            autoComplete="given-name"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ob-lastName">Last name *</Label>
          <Input
            id="ob-lastName"
            value={data.lastName}
            onChange={e => onChange({ ...data, lastName: e.target.value })}
            placeholder="Last"
            autoComplete="family-name"
            required
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="ob-email">Email</Label>
        <Input id="ob-email" type="email" value={email} disabled className="bg-muted" />
        <p className="text-xs text-muted-foreground">Your email address from sign-up.</p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="ob-phone">Phone (optional)</Label>
        <Input
          id="ob-phone"
          type="tel"
          value={data.phone}
          onChange={e => onChange({ ...data, phone: e.target.value })}
          placeholder="(555) 123-4567"
          autoComplete="tel"
        />
      </div>

      <fieldset className="space-y-3" aria-describedby="ob-address-why">
        <legend className="text-sm font-medium">Mailing address *</legend>
        <p className="text-xs text-muted-foreground" id="ob-address-why">
          Registry organizations like AKC require the owner&apos;s address on every show entry, so
          we ask for it once here.
        </p>
        <div className="space-y-1">
          <Label htmlFor="ob-street">Street address *</Label>
          <Input
            id="ob-street"
            value={data.streetAddress}
            onChange={e => onChange({ ...data, streetAddress: e.target.value })}
            autoComplete="street-address"
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <div className="space-y-1">
            <Label htmlFor="ob-city">City *</Label>
            <Input
              id="ob-city"
              value={data.city}
              onChange={e => onChange({ ...data, city: e.target.value })}
              autoComplete="address-level2"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ob-state">State / Province *</Label>
            <Input
              id="ob-state"
              value={data.state}
              onChange={e => onChange({ ...data, state: e.target.value })}
              autoComplete="address-level1"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ob-zip">ZIP / Postal code *</Label>
            <Input
              id="ob-zip"
              value={data.zipCode}
              onChange={e => onChange({ ...data, zipCode: e.target.value })}
              autoComplete="postal-code"
              required
            />
          </div>
        </div>
      </fieldset>

      {error && (
        <div className="text-destructive text-sm p-2 bg-destructive/10 rounded-md" role="alert">
          {error}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Next'}
        </Button>
      </div>
    </form>
  );
}
