/**
 * Bulk role editing for the admin Users roster — a side panel opened from the
 * floating bulk bar (docs/plan-list-toolkit.md, canvas variant D).
 *
 * Each role shows who among the selected people holds it now ("2 of 4") and
 * takes one of Add / Keep / Remove. Nothing is written until Apply, and the
 * "What will happen" box states every change first. Choices run through the
 * existing per-user runner as remove-then-add steps (bulkRoleEditPlan.ts), so
 * club scoping and the show-limited/expiring-grant protection are unchanged.
 *
 * Replaces BulkRoleDialog: its Add / Remove / Replace mode switch meant one
 * kind of change per pass and gave no view of who already held what.
 */

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/services/database/supabaseClient';
import { LOCKED_ROLES, MANAGEABLE_ROLES, ROLE_LABELS } from '@/services/rbac/roleUiConstants';
import { cn } from '@/lib/utils';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import type { BulkRoleSubmitConfig } from './bulkRoleRunner';
import {
  buildRoleEditPlan,
  describeHolding,
  effectiveChoice,
  nameOf,
  planToSteps,
  roleHoldings,
  summarizePlan,
  type RoleChoice,
} from './bulkRoleEditPlan';

interface BulkRoleEditPanelProps {
  open: boolean;
  onClose: () => void;
  selectedUsers: SelectedUser[];
  isProcessing: boolean;
  error: string | null;
  notice?: string | null;
  onSubmit: (steps: BulkRoleSubmitConfig[]) => void;
}

const CHOICES: { value: RoleChoice; label: string; on: string }[] = [
  { value: 'add', label: 'Add', on: 'bg-success/15 text-success' },
  { value: 'keep', label: 'Keep', on: 'bg-muted text-foreground' },
  { value: 'remove', label: 'Remove', on: 'bg-destructive/10 text-destructive-strong' },
];

function useClubs(enabled: boolean) {
  return useQuery<{ id: string; name: string }[]>({
    queryKey: ['clubs-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clubs')
        .select('id, name')
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
    enabled,
  });
}

export function BulkRoleEditPanel({
  open,
  onClose,
  selectedUsers,
  isProcessing,
  error,
  notice = null,
  onSubmit,
}: BulkRoleEditPanelProps) {
  const [choices, setChoices] = useState<Record<string, RoleChoice>>({});
  const [clubIds, setClubIds] = useState<string[]>([]);

  // Fresh choices on each open — adjusted during render, not in an effect
  // (React's "adjust state while rendering" pattern; see BulkActionsBar's history).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setChoices({});
      setClubIds([]);
    }
  }

  const total = selectedUsers.length;
  const holdings = useMemo(() => roleHoldings(selectedUsers, MANAGEABLE_ROLES), [selectedUsers]);
  const plan = buildRoleEditPlan(choices, holdings, total);
  const summary = summarizePlan(plan, holdings, total, clubIds.length);

  const {
    data: clubs = [],
    isLoading: clubsLoading,
    error: clubsError,
    refetch,
  } = useClubs(open && plan.needsClubs);
  const clubName = (id: string) => clubs.find(club => club.id === id)?.name ?? id;
  const missingClubs = plan.needsClubs && clubIds.length === 0;
  const nothingToDo = plan.add.length === 0 && plan.remove.length === 0;

  const names = selectedUsers.slice(0, 4).map(nameOf).join(', ');
  const subtitle = total > 4 ? `${names} and ${total - 4} more` : names;

  // The summary sits beside Apply, so nobody applies a change they have not read.
  const footer = (
    <div className="flex w-full flex-col gap-3">
      <section
        aria-labelledby="bulk-summary-heading"
        className="max-h-48 overflow-y-auto rounded-xl border border-border bg-muted p-3"
      >
        <h3 id="bulk-summary-heading" className="mb-1 text-sm font-semibold">
          What will happen
        </h3>
        {summary.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Choose Add or Remove on a role.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {summary.map(line => (
              <li
                key={line.text}
                className={line.tone === 'add' ? 'text-success' : 'text-destructive-strong'}
              >
                {line.text}
              </li>
            ))}
          </ul>
        )}
        {missingClubs && (
          <p className="mt-2 text-sm font-medium">Choose at least one club to continue.</p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          Grants limited to one show or with an end date are left unchanged.
        </p>
      </section>
      <div className="flex w-full items-center justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={isProcessing}>
          Cancel
        </Button>
        <Button
          onClick={() => onSubmit(planToSteps(plan, clubIds))}
          disabled={isProcessing || nothingToDo || missingClubs || !!clubsError}
        >
          {isProcessing ? 'Applying…' : 'Apply changes'}
        </Button>
      </div>
    </div>
  );

  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title={`Change roles for ${total} ${total === 1 ? 'person' : 'people'}`}
      subtitle={subtitle}
      size="md"
      footer={footer}
      preventClose={isProcessing}
    >
      <div className="flex flex-col gap-5 p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        <section aria-labelledby="bulk-roles-heading" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h3 id="bulk-roles-heading" className="text-sm font-semibold">
              Roles
            </h3>
            <span className="text-sm text-muted-foreground">who has it now</span>
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {holdings.map(({ role, holders }) => {
              const label = ROLE_LABELS[role] ?? role;
              const locked = LOCKED_ROLES.has(role);
              const current = effectiveChoice(role, choices[role] ?? 'keep', holders, total);
              return (
                <li key={role} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{label}</span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      {describeHolding(holders, total)}
                    </span>
                  </span>
                  {locked ? (
                    <span className="text-sm text-muted-foreground">Always assigned</span>
                  ) : (
                    <div
                      role="group"
                      aria-label={`${label}: add, keep or remove`}
                      className="inline-flex overflow-hidden rounded-lg border border-border"
                    >
                      {CHOICES.map(choice => {
                        const disabled =
                          effectiveChoice(role, choice.value, holders, total) !== choice.value;
                        const pressed = current === choice.value;
                        return (
                          <button
                            key={choice.value}
                            type="button"
                            aria-pressed={pressed}
                            disabled={disabled}
                            onClick={() => setChoices(prev => ({ ...prev, [role]: choice.value }))}
                            className={cn(
                              'h-11 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                              'disabled:cursor-not-allowed disabled:opacity-40',
                              pressed ? choice.on : 'text-muted-foreground hover:bg-muted'
                            )}
                          >
                            {choice.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {plan.needsClubs && (
          <section aria-labelledby="bulk-clubs-heading" className="flex flex-col gap-2">
            <h3 id="bulk-clubs-heading" className="text-sm font-semibold">
              Clubs
            </h3>
            <p className="text-sm text-muted-foreground">
              Secretary and Club Admin are granted per club. Changes apply to these clubs.
            </p>
            {clubsError ? (
              <Alert variant="destructive">
                <AlertDescription className="flex items-center justify-between gap-2">
                  <span>Could not load clubs.</span>
                  <Button variant="outline" onClick={() => void refetch()}>
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : clubsLoading ? (
              <p className="text-sm text-muted-foreground">Loading clubs…</p>
            ) : null}
            {clubIds.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {clubIds.map(id => (
                  <li
                    key={id}
                    className="inline-flex items-center rounded-lg border border-border pl-3"
                  >
                    <span className="text-sm">{clubName(id)}</span>
                    <button
                      type="button"
                      onClick={() => setClubIds(prev => prev.filter(c => c !== id))}
                      aria-label={`Remove ${clubName(id)}`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {clubs.some(club => !clubIds.includes(club.id)) && (
              <Select
                value=""
                onValueChange={id => {
                  // Resetting the picker to "" echoes an empty value back; ignore it.
                  if (id) setClubIds(prev => (prev.includes(id) ? prev : [...prev, id]));
                }}
              >
                <SelectTrigger className="w-full" aria-label="Add a club">
                  <SelectValue placeholder="+ Add a club…" />
                </SelectTrigger>
                <SelectContent>
                  {clubs
                    .filter(club => !clubIds.includes(club.id))
                    .map(club => (
                      <SelectItem key={club.id} value={club.id}>
                        {club.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </section>
        )}
      </div>
    </SlideOverPanel>
  );
}
