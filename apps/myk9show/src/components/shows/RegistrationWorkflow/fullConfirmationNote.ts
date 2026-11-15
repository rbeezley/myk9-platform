import type { WorkflowMode } from './RegistrationWorkflow.types';

/**
 * What the receipt step says happens next by email (MYK9-1999). The full confirmation, with the
 * armband, judge and directions, goes by itself once the entry is accepted; nobody sets a date.
 * Staff read it about the exhibitor they keyed the entry in for.
 */
export function fullConfirmationNote(mode: WorkflowMode): string {
  return mode === 'exhibitor'
    ? 'Once the show secretary accepts your entry, we will email you a full confirmation with your armband number, judge and directions.'
    : 'Once the entry is accepted, the exhibitor gets a full confirmation by email with the armband number, judge and directions.';
}
