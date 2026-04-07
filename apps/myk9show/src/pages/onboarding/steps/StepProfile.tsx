/**
 * Onboarding Step 1 - Profile
 * Collects first name, last name, phone. Required step.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ProfileData {
  firstName: string;
  lastName: string;
  phone: string;
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
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="step-profile">
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
