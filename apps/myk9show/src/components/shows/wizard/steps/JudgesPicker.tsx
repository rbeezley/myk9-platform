import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Plus, GraduationCap } from 'lucide-react';
import { GroupedSearchablePopover } from '@/components/ui/grouped-searchable-popover';
import { groupPeopleForJudges } from './ShowDetailsStep.helpers';
import type { User } from '@/types/user-types';
import type { ResolvedJudge } from './ShowDetailsStep.types';

export interface SaveCredentialsData {
  organization: string;
  judgeNumber: string;
  email: string;
}

export interface CreateJudgeData {
  firstName: string;
  lastName: string;
  organization: string;
  judgeNumber: string;
  email: string;
}

export interface JudgesPickerProps {
  selectedJudges: ResolvedJudge[];
  people: User[];
  onAddJudge: (personId: string) => void;
  onRemoveJudge: (personId: string) => void;
  onSaveCredentials: (personId: string, data: SaveCredentialsData) => Promise<void>;
  onCreateJudge: (data: CreateJudgeData) => Promise<string>;
}

type FormState = { type: 'none' } | { type: 'credentials'; person: User } | { type: 'new' };

// Spec intentionally limits to AKC and UKC — the two organizations whose
// judge credentials appear on show records. Other orgs (NACSW, CPE, etc.)
// are supported in the broader platform but not in this picker per the design spec.
const ORGS = ['AKC', 'UKC'] as const;

const GROUP_QUALIFIED = 'qualified';
const GROUP_OTHERS = 'all';

export const JudgesPicker: React.FC<JudgesPickerProps> = ({
  selectedJudges,
  people,
  onAddJudge,
  onRemoveJudge,
  onSaveCredentials,
  onCreateJudge,
}) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [formState, setFormState] = useState<FormState>({ type: 'none' });
  const [org, setOrg] = useState<string>('AKC');
  const [judgeNumber, setJudgeNumber] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedIds = useMemo(() => selectedJudges.map(j => j.id), [selectedJudges]);
  const { qualified, others } = useMemo(
    () => groupPeopleForJudges(people, selectedIds, searchTerm),
    [people, selectedIds, searchTerm]
  );

  const resetForm = () => {
    setFormState({ type: 'none' });
    setOrg('AKC');
    setJudgeNumber('');
    setEmail('');
    setFirstName('');
    setLastName('');
    setSaveError(null);
  };

  const handleSelect = (person: User, groupKey: string) => {
    if (groupKey === GROUP_QUALIFIED && person.judgeInfo?.judgeNumber) {
      onAddJudge(person.id);
    } else {
      // Either not yet qualified, or qualified but missing a judge number —
      // collect credentials before adding.
      setFormState({ type: 'credentials', person });
      setEmail(person.email ?? '');
    }
  };

  const handleOpenNewForm = () => {
    setOpen(false);
    setFormState({ type: 'new' });
  };

  const handleSaveCredentials = async () => {
    if (formState.type !== 'credentials') return;
    if (!judgeNumber.trim() || !email.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveCredentials(formState.person.id, {
        organization: org,
        judgeNumber: judgeNumber.trim(),
        email: email.trim(),
      });
      onAddJudge(formState.person.id);
      resetForm();
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateJudge = async () => {
    if (!firstName.trim() || !lastName.trim() || !judgeNumber.trim() || !email.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const newId = await onCreateJudge({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        organization: org,
        judgeNumber: judgeNumber.trim(),
        email: email.trim(),
      });
      onAddJudge(newId);
      resetForm();
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderJudgeRow = (judge: User, groupKey: string) => (
    <div
      className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
      data-judge-row="true"
    >
      <div className="font-medium text-sm">
        {judge.firstName} {judge.lastName}
        {groupKey === GROUP_QUALIFIED && judge.judgeInfo && (
          <Badge
            variant="outline"
            className="ml-2 text-[10px] px-1.5 py-0 text-emerald-400 border-emerald-400/30"
          >
            {(() => {
              const org = judge.judgeInfo.qualifications[0]?.organization;
              const num = judge.judgeInfo.judgeNumber;
              if (org && num) return `${org} #${num}`;
              if (num) return `#${num}`;
              if (org) return org;
              return 'Qualified';
            })()}
          </Badge>
        )}
      </div>
      {judge.email && <div className="text-xs text-muted-foreground">{judge.email}</div>}
      {groupKey === GROUP_OTHERS && (
        <div className="text-xs text-muted-foreground italic">Tap to add credentials</div>
      )}
    </div>
  );

  const credPerson = formState.type === 'credentials' ? formState.person : null;
  const canSaveCredentials = judgeNumber.trim() !== '' && email.trim() !== '';
  const canCreateJudge =
    firstName.trim() !== '' &&
    lastName.trim() !== '' &&
    judgeNumber.trim() !== '' &&
    email.trim() !== '';

  return (
    <div className="space-y-3">
      <Label htmlFor="judges-picker-trigger" className="flex items-center gap-1.5">
        <GraduationCap className="h-4 w-4" />
        Show Judges
      </Label>

      {/* Selected judge chips */}
      {selectedJudges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedJudges.map(judge => (
            <Badge
              key={judge.id}
              variant="secondary"
              className="flex items-center gap-1.5 py-1.5 px-3 text-sm"
            >
              <span>{judge.name}</span>
              {judge.judgeNumber && (
                <span className="text-muted-foreground text-xs">#{judge.judgeNumber}</span>
              )}
              <button
                type="button"
                aria-label={`Remove ${judge.name}`}
                onClick={() => onRemoveJudge(judge.id)}
                className="ml-1 hover:text-destructive transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Search popover */}
      {formState.type === 'none' && (
        <GroupedSearchablePopover<User>
          id="judges-picker-trigger"
          open={open}
          onOpenChange={setOpen}
          triggerLabel={
            selectedJudges.length > 0
              ? `${selectedJudges.length} judge${selectedJudges.length !== 1 ? 's' : ''} selected — add more`
              : 'Search and add judges'
          }
          searchPlaceholder="Search by name or judge number…"
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          groups={[
            {
              groupKey: GROUP_QUALIFIED,
              label: 'Qualified Judges — Credentials on File',
              items: qualified,
            },
            { groupKey: GROUP_OTHERS, label: 'All People — No Credentials Yet', items: others },
          ]}
          renderItem={renderJudgeRow}
          onSelect={handleSelect}
          footer={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-primary"
              onClick={handleOpenNewForm}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add new judge
              <span className="ml-1 text-[10px] opacity-60">(person not in system)</span>
            </Button>
          }
        />
      )}

      {/* Credentials form — existing person */}
      {formState.type === 'credentials' && credPerson && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">
              Add Judge Credentials — {credPerson.firstName} {credPerson.lastName}
            </p>
            <p className="text-xs text-emerald-500 mt-1">
              Adding credentials to {credPerson.firstName}&apos;s existing profile. No duplicate
              record will be created.
            </p>
          </div>
          <OrgAndJudgeNumberFields
            idPrefix="judge-cred"
            org={org}
            setOrg={setOrg}
            judgeNumber={judgeNumber}
            setJudgeNumber={setJudgeNumber}
          />
          <div className="space-y-1">
            <Label htmlFor="judge-cred-email" className="text-xs">
              Email *
            </Label>
            <Input
              id="judge-cred-email"
              placeholder="email@example.com"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          {saveError && <p className="text-xs text-destructive">{saveError}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSaveCredentials || saving}
              onClick={handleSaveCredentials}
            >
              Save &amp; Add to Show
            </Button>
          </div>
        </div>
      )}

      {/* New judge form — person not in system */}
      {formState.type === 'new' && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
          <p className="text-sm font-semibold">New Judge</p>
          <p className="text-xs text-muted-foreground">
            Person not in the system yet. Creates their profile and credentials.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="judge-new-first-name" className="text-xs">
                First name *
              </Label>
              <Input
                id="judge-new-first-name"
                placeholder="First name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="h-8 text-sm"
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
                className="h-8 text-sm"
              />
            </div>
          </div>
          <OrgAndJudgeNumberFields
            idPrefix="judge-new"
            org={org}
            setOrg={setOrg}
            judgeNumber={judgeNumber}
            setJudgeNumber={setJudgeNumber}
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
              className="h-8 text-sm"
            />
          </div>
          {saveError && <p className="text-xs text-destructive">{saveError}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canCreateJudge || saving}
              onClick={handleCreateJudge}
            >
              Add Judge
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Shared sub-component — org dropdown + judge number input           */
/* ------------------------------------------------------------------ */

interface OrgAndJudgeNumberFieldsProps {
  /** id prefix for the controls so the same form can render twice (credentials + new judge) without colliding ids. */
  idPrefix: string;
  org: string;
  setOrg: (v: string) => void;
  judgeNumber: string;
  setJudgeNumber: (v: string) => void;
}

const OrgAndJudgeNumberFields: React.FC<OrgAndJudgeNumberFieldsProps> = ({
  idPrefix,
  org,
  setOrg,
  judgeNumber,
  setJudgeNumber,
}) => {
  const orgId = `${idPrefix}-organization`;
  const judgeNumberId = `${idPrefix}-judge-number`;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label htmlFor={orgId} className="text-xs">
          Organization *
        </Label>
        <Select value={org} onValueChange={setOrg}>
          <SelectTrigger id={orgId} className="h-8 text-sm !bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORGS.map(o => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={judgeNumberId} className="text-xs">
          Judge Number *
        </Label>
        <Input
          id={judgeNumberId}
          placeholder="e.g. 98234"
          value={judgeNumber}
          onChange={e => setJudgeNumber(e.target.value)}
          className="h-8 text-sm"
        />
      </div>
    </div>
  );
};
