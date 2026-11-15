// The owner's queue shows one free-text note per request. The form's extra
// answers (organization, contact, first show date, message) go into it so the
// owner sees them next to the club's own numbers.

export interface ClubOnboardingNoteFields {
  organization: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  firstShowDate: string;
  message: string;
}

export function buildClubOnboardingNote(fields: ClubOnboardingNoteFields): string {
  const lines = [
    `Organization: ${fields.organization}`,
    `Contact: ${fields.contactName.trim()} <${fields.contactEmail.trim()}>`,
    fields.contactPhone.trim() ? `Phone: ${fields.contactPhone.trim()}` : '',
    fields.firstShowDate ? `First show date: ${fields.firstShowDate}` : '',
    fields.message.trim() ? `Message: ${fields.message.trim()}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}
