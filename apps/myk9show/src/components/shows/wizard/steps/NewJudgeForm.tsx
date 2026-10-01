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
  /** Creates the person and their judge credentials; resolves to the new person id. */
  onCreateJudge: (data: CreateJudgeData) => Promise<string>;
  /** Called with the new person id (and what was typed) once the judge exists. */
  onCreated: (personId: string, data: CreateJudgeData) => void;
  onCancel: () => void;
  /** Organization the form opens on; the wizard picker's default is AKC. */
  defaultOrg?: string;
  /** Fixes the new judge's organization (shown, not choosable). */
  lockedOrg?: string;
}

/**
 * Inline "new judge" form: the person is not in the system yet, so this creates
 * their profile and judge credentials in one step. Shared by the show wizard's
 * JudgesPicker and the Show Edit Judges tab so a judge can be created in place
 * on either surface (MYK9-903).
 */
export const NewJudgeForm: React.FC<NewJudgeFormProps> = ({
  onCreateJudge,
  onCreated,
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
  // The panel (or this form) can close while the create is in flight. The judge
  // then exists, but there is no roster left to assign into and no state to set.
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
    if (!canCreateJudge || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const data: CreateJudgeData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        organization: org,
        judgeNumber: judgeNumber.trim(),
        email: email.trim(),
      };
      const newId = await onCreateJudge(data);
      if (!mountedRef.current) return;
      onCreated(newId, data);
    } catch {
      if (mountedRef.current) setSaveError('Failed to save. Please try again.');
    } finally {
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
