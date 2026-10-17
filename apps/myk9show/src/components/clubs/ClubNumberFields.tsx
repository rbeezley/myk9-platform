import React from 'react';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import {
  CLUB_NUMBER_HELP_TEXT,
  CLUB_NUMBER_LABEL,
  CLUB_REGISTRY_ORGS,
  type ClubRegistryNumberInputs,
  type ClubRegistryOrg,
} from '@/utils/clubRegistryNumbers';

interface ClubNumberFieldsProps {
  values: ClubRegistryNumberInputs;
  onChange: (org: ClubRegistryOrg, value: string) => void;
  /** The DOM id of each input, so a caller can focus it from its own validation. */
  idFor: (org: ClubRegistryOrg) => string;
  onBlur?: ((org: ClubRegistryOrg) => void) | undefined;
  /** The "enter at least one" message, shown once under the group. */
  error?: string | null | undefined;
  disabled?: boolean | undefined;
}

/**
 * MYK9-1235: one input per registry (AKC, UKC, ASCA) for a club's number. The
 * rule is "at least one", not "all three", so no single field is marked
 * required; the caller owns the check and passes the message back as `error`.
 */
export const ClubNumberFields: React.FC<ClubNumberFieldsProps> = ({
  values,
  onChange,
  idFor,
  onBlur,
  error,
  disabled = false,
}) => {
  const helpId = `${idFor('AKC')}-help`;
  return (
    <fieldset className="space-y-3" aria-describedby={helpId}>
      <legend className="text-sm font-medium">Club numbers</legend>
      <p id={helpId} className="text-xs text-muted-foreground">
        {CLUB_NUMBER_HELP_TEXT}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CLUB_REGISTRY_ORGS.map(org => (
          <FormField key={org} label={CLUB_NUMBER_LABEL[org]} fieldId={idFor(org)}>
            <Input
              id={idFor(org)}
              value={values[org]}
              onChange={event => onChange(org, event.target.value)}
              onBlur={onBlur ? () => onBlur(org) : undefined}
              disabled={disabled}
              maxLength={50}
              aria-invalid={error ? true : undefined}
              autoComplete="off"
            />
          </FormField>
        ))}
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
};
