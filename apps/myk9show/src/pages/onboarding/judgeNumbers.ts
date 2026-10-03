/**
 * Judge numbers for the onboarding judge step (MYK9-970).
 *
 * A judge number lives on judge_qualifications.judge_number, one per
 * organization (migration 070). Qualification rows themselves are written only
 * by secretaries and site admins (MYK9-354), so the judge step never creates a
 * row: it lists the organizations already on file for this person and saves
 * numbers through `set_my_judge_numbers`, which resolves the caller's person
 * server-side and updates only their own existing rows.
 *
 * Direct reads are deliberate: onboarding is an online, account-setup flow
 * (creating the profile already needs the network), not a show-day surface.
 */

import { supabase } from '@/lib/supabase';
import { JUDGE_ORGANIZATIONS } from '@/features/judges/judgeOrganizations';

export interface JudgeNumberEntry {
  organization: string;
  judge_number: string;
}

export interface JudgeRegistryNumber extends JudgeNumberEntry {
  label: string;
}

interface QualificationRow {
  organization: string | null;
  judge_number: string | null;
}

/** One entry per organization; the first non-empty stored number pre-fills it. */
export function groupJudgeNumbers(rows: readonly QualificationRow[]): JudgeRegistryNumber[] {
  const byOrganization = new Map<string, JudgeRegistryNumber>();
  for (const row of rows) {
    if (!row.organization) continue;
    const existing = byOrganization.get(row.organization);
    const number = row.judge_number?.trim() ?? '';
    if (!existing) {
      const label =
        JUDGE_ORGANIZATIONS.find(org => org.value === row.organization)?.label ?? row.organization;
      byOrganization.set(row.organization, {
        organization: row.organization,
        judge_number: number,
        label,
      });
    } else if (!existing.judge_number && number) {
      existing.judge_number = number;
    }
  }
  return [...byOrganization.values()].sort((a, b) => a.organization.localeCompare(b.organization));
}

export async function fetchMyJudgeNumbers(personId: string): Promise<JudgeRegistryNumber[]> {
  const { data, error } = await supabase
    .from('judge_qualifications')
    .select('organization, judge_number')
    .eq('person_id', personId);
  if (error) throw error;
  return groupJudgeNumbers(data ?? []);
}

export async function saveMyJudgeNumbers(entries: readonly JudgeNumberEntry[]): Promise<void> {
  const { error } = await supabase.rpc('set_my_judge_numbers', {
    p_numbers: entries.map(entry => ({
      organization: entry.organization,
      judge_number: entry.judge_number.trim(),
    })),
  });
  if (error) throw new Error("We couldn't save your judge numbers. Please try again.");
}
