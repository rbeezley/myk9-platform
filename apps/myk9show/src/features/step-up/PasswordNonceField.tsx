/** MYK9-1208: the code field shown when a password change needs the emailed code. */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PasswordNonceField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="password-change-code">Code from the email</Label>
      <Input
        id="password-change-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={value}
        onChange={event => onChange(event.target.value)}
      />
    </div>
  );
}
