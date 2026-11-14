// The confirmation number printed on a scheduled confirmation email.
//
// MYK9-1963: the same value the exhibitor sees on the success page
// (enrollments.confirmation_number, reached through entries.registration_id),
// never a stand-in. An entry with no enrollment, or an enrollment without a
// number, gets no receipt line.

interface EnrollmentNumberRow {
  id: string;
  confirmation_number: string | null;
}

interface EnrollmentNumberReader {
  from(table: 'enrollments'): {
    select(columns: string): {
      in(
        column: string,
        values: string[]
      ): PromiseLike<{ data: EnrollmentNumberRow[] | null; error: unknown }>;
    };
  };
}

/** Confirmation number by enrollment id, for the enrollments the given entries belong to. */
export async function loadConfirmationNumbers(
  supabase: EnrollmentNumberReader,
  registrationIds: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const ids = [...new Set(registrationIds.filter((id): id is string => !!id))];
  const numbers = new Map<string, string>();
  if (ids.length === 0) return numbers;
  const { data, error } = await supabase
    .from('enrollments')
    .select('id, confirmation_number')
    .in('id', ids);
  // A failed lookup leaves the receipt line off; the email still goes out.
  if (error || !data) return numbers;
  for (const row of data) {
    if (row.confirmation_number) numbers.set(row.id, row.confirmation_number);
  }
  return numbers;
}
