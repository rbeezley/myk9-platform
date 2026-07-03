export const CONFIRMATION_NUMBER_LABEL = 'Confirmation #';

export function formatConfirmationNumberLabel(value: string): string {
  return `${CONFIRMATION_NUMBER_LABEL} ${value}`;
}
