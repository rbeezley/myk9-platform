/**
 * Builds the inbox message body sent to an exhibitor when a waitlist spot is
 * offered to them. Kept pure + separate so the copy is unit-testable and the
 * data hook stays focused on orchestration.
 */

export interface WaitlistOfferMessageInput {
  /** Dog's call name (preferred) or registered name. Null when unknown. */
  dogName: string | null;
  /** Class name the spot opened in. Null when unknown. */
  className: string | null;
}

export function buildWaitlistOfferMessage({
  dogName,
  className,
}: WaitlistOfferMessageInput): string {
  const dogPart = dogName ? ` for ${dogName}` : '';
  const classPart = className ? ` in ${className}` : '';
  return (
    `A waitlist spot${classPart} just opened up${dogPart}! ` +
    `Open My Entries to accept the offer before it expires.`
  );
}
