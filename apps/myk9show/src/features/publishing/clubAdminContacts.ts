/**
 * MYK9-2208: the club's admins as a secretary who is not one sees them on the payouts line:
 * their names ("Waiting on Pat Lee, the club admin") and one tap to email them the Payments link.
 * The read is public.get_show_club_admin_contacts (a show the caller manages) or, where no show
 * exists yet (MYK9-2217), public.get_club_admin_contacts (a club the caller manages).
 */

export interface ClubAdminContact {
  name: string | null;
  email: string;
}

/** What the payouts line needs: who to name and the ready-made mailto. */
export interface ClubAdminEmail {
  /** "Pat Lee", "Pat Lee and Sam Roe", "Pat Lee, Sam Roe and Kim Fox". */
  names: string;
  count: number;
  mailto: string;
}

/** Reads the RPC's rows. A malformed response is an error, so the line falls back, not blanks. */
export function parseClubAdminContacts(data: unknown): ClubAdminContact[] {
  if (!Array.isArray(data)) throw new Error('Unexpected club admin contacts response.');
  return data.flatMap(raw => {
    const row = (raw ?? {}) as Record<string, unknown>;
    if (typeof row.email !== 'string' || row.email.trim() === '') return [];
    return [
      {
        name:
          typeof row.display_name === 'string' && row.display_name.trim() !== ''
            ? row.display_name.trim()
            : null,
        email: row.email.trim(),
      },
    ];
  });
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export const CLUB_ADMIN_EMAIL_SUBJECT = 'Please finish setting up payouts for our show';

/**
 * Builds the line's names and the mailto (every admin in To, a short subject, one plain
 * sentence and the absolute Payments URL). Null when there is nobody to email.
 */
export function buildClubAdminEmail(
  contacts: ClubAdminContact[],
  paymentsUrl: string
): ClubAdminEmail | null {
  if (contacts.length === 0) return null;
  const to = contacts.map(contact => encodeURIComponent(contact.email).replace(/%40/g, '@'));
  const body = `Please finish setting up payouts for our club so we can publish our show: ${paymentsUrl}`;
  return {
    names: joinNames(contacts.map(contact => contact.name ?? contact.email)),
    count: contacts.length,
    mailto: `mailto:${to.join(',')}?subject=${encodeURIComponent(CLUB_ADMIN_EMAIL_SUBJECT)}&body=${encodeURIComponent(body)}`,
  };
}
