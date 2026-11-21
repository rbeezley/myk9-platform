/**
 * The withdrawal policy card's data: which columns each scope writes, the form shape, the one
 * read and the one write. Kept beside `WithdrawalPolicyCard.tsx` so the card stays a view.
 *
 * Online only: the policy columns are read and written through PostgREST, never through the
 * offline mutation queue, and the policy text (MYK9-1976) follows them.
 */
import { supabase } from '@/lib/supabase';
import type { TablesUpdate } from '@/types/supabase';
import type { RegistryId } from '@/features/registries';
import { registryFromTrials } from '@/features/payments/useEffectiveWithdrawalPolicy';
import {
  getEffectiveWithdrawalPolicy,
  type ClubWithdrawalFields,
  type RetentionType,
  type WithdrawalPolicy,
} from '@/features/payments/withdrawalPolicy';
import {
  buildDefaultWithdrawalPolicyText,
  normalizeWithdrawalPolicyText,
} from '@/features/payments/withdrawalPolicyText';

export type Scope = 'club' | 'show';

interface ColumnSet {
  table: 'clubs' | 'shows';
  /** Absent at club scope (MYK9-454): a cutoff is a date only one show can anchor. */
  cutoff?: string;
  type: string;
  value: string;
  notes: string;
  text: string;
}

export const COLUMNS: Record<Scope, ColumnSet> = {
  club: {
    table: 'clubs',
    type: 'default_withdrawal_retention_type',
    value: 'default_withdrawal_retention_value',
    notes: 'default_withdrawal_policy_notes',
    text: 'default_withdrawal_policy_text',
  },
  show: {
    table: 'shows',
    cutoff: 'withdrawal_cutoff_date',
    type: 'withdrawal_retention_type',
    value: 'withdrawal_retention_value',
    notes: 'withdrawal_policy_notes',
    text: 'withdrawal_policy_text',
  },
};

/** What a show's card also needs to know: what it inherits when it sets nothing. */
const SHOW_CONTEXT_COLUMNS =
  'pre_entry_fee, trials ( registry_id ), clubs ( default_withdrawal_retention_type, default_withdrawal_retention_value, default_withdrawal_policy_notes, default_withdrawal_policy_text )';

export interface FormState {
  cutoffDate: string; // '' or 'YYYY-MM-DD'
  retentionType: RetentionType;
  /** Display units: dollars when flat, whole percent when percent. '' = none. */
  retentionInput: string;
  notes: string;
  /** The club's own policy text; meaningful only while `textCustom`. */
  text: string;
  /** False = no text of this scope's own: the inherited text applies (stored as NULL). */
  textCustom: boolean;
}

export const EMPTY_FORM: FormState = {
  cutoffDate: '',
  retentionType: 'flat',
  retentionInput: '',
  notes: '',
  text: '',
  textCustom: false,
};

/** What applies when this scope sets no text of its own. */
export interface PolicyInheritance {
  /** The club's structured defaults (show scope only). */
  clubFields: ClubWithdrawalFields | null;
  /** The club's own text (show scope only). */
  clubText: string | null;
  /** The show's registry (show scope only); the club's card serves every registry. */
  registryId: RegistryId | null;
  /** The show's regular entry fee in cents, when it has one. */
  entryFeeCents: number | null;
}

export interface LoadedPolicy {
  form: FormState;
  inheritance: PolicyInheritance;
}

/**
 * Display input → stored integer (cents for flat, whole percent for percent).
 *
 * Exported for direct testing: `<input type="number">` will not carry a non-finite literal
 * through jsdom, so the component cannot exercise the Number.isFinite guard end to end.
 */
export function inputToStored(type: RetentionType, input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  // NaN AND non-finite: <input type="number"> accepts '1e999', which becomes Infinity,
  // serializes to JSON null, and lands as {type:'flat', value:null}, a row that reads as a
  // DECLARED retention and so suppresses the club fee.
  if (!Number.isFinite(parsed)) return null;
  return type === 'flat' ? Math.round(parsed * 100) : Math.round(parsed);
}

function toOne<T>(raw: unknown): T | null {
  return ((Array.isArray(raw) ? raw[0] : raw) as T | undefined) ?? null;
}

export async function loadPolicy(scope: Scope, entityId: string): Promise<LoadedPolicy> {
  const cols = COLUMNS[scope];
  const own = [cols.cutoff, cols.type, cols.value, cols.notes, cols.text].filter(Boolean);
  const select = scope === 'show' ? `${own.join(', ')}, ${SHOW_CONTEXT_COLUMNS}` : own.join(', ');
  const { data: row, error } = await supabase
    .from(cols.table)
    .select(select)
    .eq('id', entityId)
    .single();
  if (error) throw error;
  // A runtime (non-literal) select string defeats supabase-js's typed-row inference, so
  // route the cast through unknown.
  const r = row as unknown as Record<string, unknown>;
  const type = (r[cols.type] as string | null) ?? null;
  const value = (r[cols.value] as number | null) ?? null;
  const retentionType: RetentionType = type === 'percent' ? 'percent' : 'flat';
  const storedText = normalizeWithdrawalPolicyText(r[cols.text] as string | null);
  const club = scope === 'show' ? toOne<Record<string, unknown>>(r.clubs) : null;
  const fee = scope === 'show' ? (r.pre_entry_fee as number | string | null | undefined) : null;
  const feeDollars = fee === null || fee === undefined || fee === '' ? null : Number(fee);
  return {
    form: {
      cutoffDate: cols.cutoff ? ((r[cols.cutoff] as string | null) ?? '') : '',
      retentionType,
      retentionInput:
        value === null ? '' : retentionType === 'flat' ? (value / 100).toFixed(2) : String(value),
      notes: (r[cols.notes] as string | null) ?? '',
      text: storedText ?? '',
      textCustom: storedText !== null,
    },
    inheritance: {
      clubFields: club as ClubWithdrawalFields | null,
      clubText: normalizeWithdrawalPolicyText(
        club?.default_withdrawal_policy_text as string | null | undefined
      ),
      registryId: scope === 'show' ? registryFromTrials(r.trials) : null,
      entryFeeCents:
        feeDollars !== null && Number.isFinite(feeDollars) ? Math.round(feeDollars * 100) : null,
    },
  };
}

/** The structured policy the form describes, composed with the club's like a show resolves. */
export function policyFromForm(
  scope: Scope,
  form: FormState,
  inheritance: PolicyInheritance | null
): WithdrawalPolicy | null {
  const value = inputToStored(form.retentionType, form.retentionInput);
  const type = value === null ? null : form.retentionType;
  const notes = form.notes.trim() || null;
  if (scope === 'club') {
    return getEffectiveWithdrawalPolicy(null, {
      default_withdrawal_retention_type: type,
      default_withdrawal_retention_value: value,
      default_withdrawal_policy_notes: notes,
    });
  }
  return getEffectiveWithdrawalPolicy(
    {
      withdrawal_cutoff_date: form.cutoffDate || null,
      withdrawal_retention_type: type,
      withdrawal_retention_value: value,
      withdrawal_policy_notes: notes,
    },
    inheritance?.clubFields ?? null
  );
}

/** The text that applies when this scope sets none: the club's (for a show), else the default. */
export function inheritedText(
  scope: Scope,
  form: FormState,
  inheritance: PolicyInheritance | null
): { text: string; source: 'club' | 'default' } {
  if (scope === 'show' && inheritance?.clubText) {
    return { text: inheritance.clubText, source: 'club' };
  }
  return {
    text: buildDefaultWithdrawalPolicyText(
      policyFromForm(scope, form, inheritance),
      inheritance?.registryId ?? null
    ),
    source: 'default',
  };
}

/** The columns a save writes, typed per scope so each table only receives its own columns. */
export type PolicyPayload =
  | { scope: 'club'; update: TablesUpdate<'clubs'> }
  | { scope: 'show'; update: TablesUpdate<'shows'> };

export function buildPayload(
  scope: Scope,
  form: FormState,
  inheritance: PolicyInheritance | null
): PolicyPayload {
  const storedValue = inputToStored(form.retentionType, form.retentionInput);
  const ownText = form.textCustom ? normalizeWithdrawalPolicyText(form.text) : null;
  // A text identical to what it would inherit is not the club's own words: store NULL so it
  // keeps following the fields (or the club) instead of freezing today's wording.
  const text =
    ownText !== null && ownText === inheritedText(scope, form, inheritance).text ? null : ownText;
  // Retention type/value only mean something together; null them as a pair.
  const retentionType = storedValue === null ? null : form.retentionType;
  const notes = form.notes.trim() || null;
  if (scope === 'club') {
    return {
      scope,
      update: {
        default_withdrawal_retention_type: retentionType,
        default_withdrawal_retention_value: storedValue,
        default_withdrawal_policy_notes: notes,
        default_withdrawal_policy_text: text,
      },
    };
  }
  return {
    scope,
    update: {
      withdrawal_cutoff_date: form.cutoffDate || null,
      withdrawal_retention_type: retentionType,
      withdrawal_retention_value: storedValue,
      withdrawal_policy_notes: notes,
      withdrawal_policy_text: text,
    },
  };
}

export async function savePolicy(entityId: string, payload: PolicyPayload): Promise<void> {
  const { error } =
    payload.scope === 'club'
      ? await supabase.from('clubs').update(payload.update).eq('id', entityId)
      : await supabase.from('shows').update(payload.update).eq('id', entityId);
  if (error) throw error;
}
