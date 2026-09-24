import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label/label';
import {
  getJuniorHandlerRule,
  registriesIssuingJuniorHandlerNumbers,
} from '@/features/registries/juniorHandlerPolicy';
import type { RegistryId } from '@/features/registries';

/**
 * MYK9-570: the two junior handler inputs, shared by the exhibitor's own
 * account page and the secretary's person edit panel.
 *
 * ONE component, two hosts — the alternative was the same three inputs written
 * twice with two sets of labels, which is how "is this person a junior?" ends
 * up answered differently on two screens.
 *
 * INTENT: there is no "Junior handler" checkbox here, and there must never be
 * one. Junior is derived from the date of birth and the trial date under the
 * registry's rule (juniorHandlerPolicy.ts), so a secretary who fills this in
 * once never has to remember to clear it the year the handler turns 18. The
 * hint text says so, because a user who cannot find the checkbox needs to know
 * the software already handled it.
 */
export interface JuniorHandlerFieldsProps {
  dateOfBirth: string;
  juniorHandlerNumbers: Partial<Record<RegistryId, string>>;
  onDateOfBirthChange: (value: string) => void;
  onJuniorHandlerNumberChange: (registryId: RegistryId, value: string) => void;
  dateOfBirthError?: string | undefined;
  /** Prefix for the generated input ids, so two instances never collide. */
  idPrefix?: string;
  disabled?: boolean;
  /**
   * MYK9-664: the host may SET these but not see what is stored (a show
   * manager's person editor). The inputs start blank, and the wording says a
   * blank leaves the stored value alone, so nobody mistakes blank for "none".
   */
  writeOnly?: boolean;
}

/**
 * Today, as the `max` a date input will accept.
 *
 * Computed in UTC because both validators compare `new Date(value + 'T00:00:00Z')`
 * against `Date.now()`. Using the LOCAL calendar here offered a viewer east of
 * Greenwich a date their own save would then refuse.
 */
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function JuniorHandlerFields({
  dateOfBirth,
  juniorHandlerNumbers,
  onDateOfBirthChange,
  onJuniorHandlerNumberChange,
  dateOfBirthError,
  idPrefix = 'junior-handler',
  disabled = false,
  writeOnly = false,
}: JuniorHandlerFieldsProps): React.JSX.Element {
  const dobId = `${idPrefix}-date-of-birth`;
  const hintId = `${idPrefix}-date-of-birth-hint`;
  const errorId = `${idPrefix}-date-of-birth-error`;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={dobId}>Date of birth</Label>
        <Input
          id={dobId}
          type="date"
          max={todayIsoDate()}
          value={dateOfBirth}
          disabled={disabled}
          aria-describedby={dateOfBirthError ? errorId : hintId}
          {...(dateOfBirthError ? { 'aria-invalid': true } : {})}
          onChange={event => onDateOfBirthChange(event.target.value)}
        />
        {dateOfBirthError ? (
          <p id={errorId} className="text-xs text-destructive">
            {dateOfBirthError}
          </p>
        ) : (
          <p id={hintId} className="text-xs text-muted-foreground">
            {writeOnly
              ? "For the handler's privacy, a saved date of birth is never shown here. Enter one to set or replace it; leave it blank to keep what's on file. It is only used to work out junior handler status at each trial."
              : 'Only used to work out junior handler status on the day of each trial, and to fill in registry paperwork. Never shown on public pages or results.'}
          </p>
        )}
      </div>

      {registriesIssuingJuniorHandlerNumbers().map(registryId => {
        const label = getJuniorHandlerRule(registryId).juniorHandlerNumberLabel;
        if (!label) return null;
        const fieldId = `${idPrefix}-number-${registryId.toLowerCase()}`;
        return (
          <div key={registryId} className="space-y-1.5">
            <Label htmlFor={fieldId}>{label}</Label>
            <Input
              id={fieldId}
              value={juniorHandlerNumbers[registryId] ?? ''}
              disabled={disabled}
              autoComplete="off"
              placeholder={
                writeOnly
                  ? "Leave blank to keep what's on file"
                  : "Leave blank if they don't have one"
              }
              onChange={event => onJuniorHandlerNumberChange(registryId, event.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}
