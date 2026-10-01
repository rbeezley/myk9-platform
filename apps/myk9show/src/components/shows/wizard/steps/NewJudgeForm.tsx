import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OrgAndJudgeNumberFields } from './OrgAndJudgeNumberFields';

export interface CreateJudgeData {
  firstName: string;
  lastName: string;
  organization: string;
  judgeNumber: string;
  email: string;
}

interface NewJudgeFormProps {
  /**
   * Runs the create (and whatever the caller does with the result). The form owns
   * only the typing and its own button state: it knows nothing about assignment, so
   * a caller whose form can unmount mid-create keeps the operation elsewhere.
   * Reject to keep the form open with its values and show the failure message.
   */
  onSubmit: (data: CreateJudgeData) => Promise<void>;
  onCancel: () => void;
  /** Organization the form opens on; the wizard picker's default is AKC. */
  defaultOrg?: string;
  /** Fixes the new judge's organization (shown, not choosable). */
  lockedOrg?: string;
}

/**
 * Inline "new judge" form: the person is not in the system yet, so this collects
 * their profile and judge credentials in one step. Presentational: shared by the
 * show wizard's JudgesPicker and the Show Edit Judges tab (MYK9-903, MYK9-908).
 */
export const NewJudgeForm: React.FC<NewJudgeFormProps> = ({
  onSubmit,
  onCancel,
  defaultOrg = 'AKC',
  lockedOrg,
}) => {
  const [orgChoice, setOrg] = useState<string>(defaultOrg);
  const org = lockedOrg ?? orgChoice;
  const [judgeNumber, setJudgeNumber] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Synchronous guard: `saving` state lags a render behind a fast double click.
  const inFlightRef = useRef(false);
  // The form can unmount mid-submit (tab switch); never set state afterwards.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const canCreateJudge =
    firstName.trim() !== '' &&
    lastName.trim() !== '' &&
    judgeNumber.trim() !== '' &&
    email.trim() !== '';

  const handleCreateJudge = async () => {
    if (!canCreateJudge || inFlightRef.current) return;
    inFlightRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        organization: org,
        judgeNumber: judgeNumber.trim(),
        email: email.trim(),
      });
    } catch {
      if (mountedRef.current) setSaveError('Failed to save. Please try again.');
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
      <p className="text-sm font-semibold">New Judge</p>
      <p className="text-xs text-muted-foreground">
        Person not in the system yet. Creates their profile and credentials.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="judge-new-first-name" className="text-xs">
            First name *
          </Label>
          <Input
            id="judge-new-first-name"
            placeholder="First name"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="judge-new-last-name" className="text-xs">
            Last name *
          </Label>
          <Input
            id="judge-new-last-name"
            placeholder="Last name"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            className="text-sm"
          />
        </div>
      </div>
      <OrgAndJudgeNumberFields
        idPrefix="judge-new"
        org={org}
        setOrg={setOrg}
        judgeNumber={judgeNumber}
        setJudgeNumber={setJudgeNumber}
        lockedOrg={lockedOrg}
      />
      <div className="space-y-1">
        <Label htmlFor="judge-new-email" className="text-xs">
          Email *
        </Label>
        <Input
          id="judge-new-email"
          placeholder="email@example.com"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="text-sm"
        />
      </div>
      {saveError && <p className="text-xs text-destructive">{saveError}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={onCancel}
          className="w-full sm:w-auto"
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!canCreateJudge || saving}
          onClick={handleCreateJudge}
          className="w-full sm:w-auto"
        >
          Add Judge
        </Button>
      </div>
    </div>
  );
};
