import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Spec intentionally limits to AKC and UKC — the two organizations whose
// judge credentials appear on show records. Other orgs (NACSW, CPE, etc.)
// are supported in the broader platform but not in this picker per the design spec.
export const JUDGE_FORM_ORGS = ['AKC', 'UKC'] as const;
const ORGS = JUDGE_FORM_ORGS;

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
  /** When set, the organization is fixed (shown, not choosable). */
  lockedOrg?: string | undefined;
}

export const OrgAndJudgeNumberFields: React.FC<OrgAndJudgeNumberFieldsProps> = ({
  idPrefix,
  org,
  setOrg,
  judgeNumber,
  setJudgeNumber,
  lockedOrg,
}) => {
  const orgId = `${idPrefix}-organization`;
  const judgeNumberId = `${idPrefix}-judge-number`;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor={orgId} className="text-xs">
          Organization *
        </Label>
        {lockedOrg ? (
          <p id={orgId} className="flex h-11 items-center text-sm font-medium">
            {lockedOrg}
          </p>
        ) : (
          <Select value={org} onValueChange={setOrg}>
            <SelectTrigger id={orgId} className="text-sm !bg-background">
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
        )}
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
          className="text-sm"
        />
      </div>
    </div>
  );
};
