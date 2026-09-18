import type { EntryValidationError } from './EntryValidator';

/**
 * The per-class minimum/maximum handler age check, lifted out of
 * `EntryValidator.validateHandler` (MYK9-570) so that file stops growing past
 * the 500-line limit, and so the rule can be tested without assembling a whole
 * `EntryValidationContext`.
 *
 * MYK9-570 note: this reads `dateOfBirth`, which is now backed by
 * `people.date_of_birth`. It used to read a `birthDate` alias that no mapper
 * ever populated, so the block could not fire at all. It is still gated on
 * `class.handlerAgeRestrictions`, which nothing in the app sets today — so
 * backing the column changed no behaviour, and this stays inert until a class
 * carries a restriction.
 *
 * Unrelated to junior handler status, which is derived per trial under a
 * REGISTRY rule (`@/features/registries/juniorHandlerPolicy`). This is a club's
 * own restriction on who may run a class; the two must not be conflated.
 */
export interface HandlerAgeRestrictions {
  min?: number | undefined;
  max?: number | undefined;
}

/** Completed years between two dates, by calendar comparison. */
export function calculateHandlerAge(dateOfBirth: string, eventDate: string): number {
  const birth = new Date(dateOfBirth);
  const event = new Date(eventDate);

  let age = event.getFullYear() - birth.getFullYear();
  const monthDiff = event.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && event.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function validateHandlerAge(params: {
  dateOfBirth: string | null | undefined;
  eventStartDate: string;
  restrictions: HandlerAgeRestrictions | null | undefined;
}): EntryValidationError[] {
  const { dateOfBirth, eventStartDate, restrictions } = params;
  if (!dateOfBirth || !restrictions) return [];

  const age = calculateHandlerAge(dateOfBirth, eventStartDate);
  const errors: EntryValidationError[] = [];

  if (restrictions.min && age < restrictions.min) {
    errors.push({
      field: 'handlerAge',
      code: 'HANDLER_TOO_YOUNG',
      message: `Handler must be at least ${restrictions.min} years old`,
      severity: 'error',
    });
  }
  if (restrictions.max && age > restrictions.max) {
    errors.push({
      field: 'handlerAge',
      code: 'HANDLER_TOO_OLD',
      message: `Handler cannot be older than ${restrictions.max} years`,
      severity: 'error',
    });
  }
  return errors;
}
