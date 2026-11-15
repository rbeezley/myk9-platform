// The facts every exhibitor email states the same way (MYK9-1999): the show's street address,
// the judge of each class, and where My Shows is. Deno-free so vitest can import it.
//
// A byte-for-byte copy lives at apps/myk9show/supabase/functions/_shared/exhibitorEmailFacts.ts
// for the Stripe webhook, which deploys from that tree; exhibitorEmailFacts.test.ts fails when
// the two differ. Edit both together.

/** The show columns the street address is written from. */
export interface ShowAddressRow {
  venue_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * The street address on one line: "Fairgrounds Hall, 1200 Fairgrounds Rd, Springfield, IL 62701".
 * Null when the show has no street, so an email never passes a city off as an address.
 */
export function formatStreetAddress(show: ShowAddressRow | null | undefined): string | null {
  const street = clean(show?.address);
  if (!street) return null;
  const stateZip = [clean(show?.state), clean(show?.zip_code)].filter(Boolean).join(' ');
  return [clean(show?.venue_name), street, clean(show?.city), stateZip].filter(Boolean).join(', ');
}

/** A judge_assignments row as the email senders read it, with the judge's person embedded. */
export interface ClassJudgeRow {
  class_id: string | null;
  status: string | null;
  person: { first_name?: string | null; last_name?: string | null } | null;
}

/**
 * The judge's name per class. Only a confirmed assignment names a judge (the rule the app's
 * judgeNamesByClass and the ringside reads use); one confirmed row per class is enforced by
 * judge_assignments_one_confirmed_judge_per_class.
 */
export function judgeNameByClass(rows: ClassJudgeRow[] | null | undefined): Map<string, string> {
  const byClass = new Map<string, string>();
  for (const row of rows ?? []) {
    if (row.status !== 'confirmed' || !row.class_id) continue;
    const name = [clean(row.person?.first_name), clean(row.person?.last_name)]
      .filter(Boolean)
      .join(' ');
    if (name) byClass.set(row.class_id, name);
  }
  return byClass;
}

/** What an email says when a class has no confirmed judge yet. */
export const JUDGE_NOT_SET = 'Judge to be announced';

/** The judge line for a class: the confirmed judge, else JUDGE_NOT_SET. */
export function judgeFor(byClass: Map<string, string>, classId: string | null | undefined): string {
  return (classId && byClass.get(classId)) || JUDGE_NOT_SET;
}

/** The slice of a Supabase client the judge read needs. */
export interface ClassJudgeClient {
  from(table: 'judge_assignments'): {
    select(columns: string): {
      in(
        column: 'class_id',
        values: string[]
      ): PromiseLike<{ data: ClassJudgeRow[] | null; error: unknown }>;
    };
  };
}

/**
 * Reads the confirmed judge of each class. A failed read is an empty map: the email still goes,
 * saying "Judge to be announced", rather than not going at all.
 */
export async function loadJudgeNamesByClass(
  client: ClassJudgeClient,
  classIds: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const ids = [...new Set(classIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const { data, error } = await client
    .from('judge_assignments')
    .select('class_id, status, person:people(first_name, last_name)')
    .in('class_id', ids);
  if (error) {
    console.error('Could not read class judges for an exhibitor email');
    return new Map();
  }
  return judgeNameByClass(data);
}

/** My Shows, where every exhibitor email sends her for the current details. */
export function myShowsUrl(siteUrl: string | null | undefined): string {
  return `${(siteUrl || 'https://myk9show.com').replace(/\/+$/, '')}/exhibitor/entries`;
}
