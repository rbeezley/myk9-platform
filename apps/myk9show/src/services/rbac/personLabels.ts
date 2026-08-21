export interface PersonLabelRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export function formatPersonLabel(person: PersonLabelRow | undefined): string | undefined {
  if (!person) return undefined;
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
  if (name && person.email) return `${name} (${person.email})`;
  return name || person.email || undefined;
}
