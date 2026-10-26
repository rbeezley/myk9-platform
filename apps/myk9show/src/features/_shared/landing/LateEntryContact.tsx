import { useContext } from 'react';
import { LateEntryContactContext, ShowHasHappenedContext } from './lateEntryContactContext';

/** The closed-entries contact sentence; the one copy every landing style renders. */
/** `lead` is text that belongs to the same sentence run (kept inside the one span, see below). */
export function LateEntryContact({ lead = '' }: { lead?: string }) {
  const contact = useContext(LateEntryContactContext);
  const showHasHappened = useContext(ShowHasHappenedContext);
  // A finished show takes no late entries: no offer, no mailto, and the lead ("Entries are
  // closed") is redundant.
  if (showHasHappened) return <span>This show has already taken place.</span>;
  // One <span> so the sentence stays a single run of inline text even when the parent is a
  // flex container (an inline-flex paragraph would split text and link into separate items).
  if (contact === undefined)
    return <span>{lead}Contact the trial secretary for late-entry help.</span>;
  if (contact === null) return <span>{lead}The club has not listed a secretary yet.</span>;
  const label = contact.name ?? contact.email;
  return (
    <span>
      {lead}Contact{' '}
      {contact.email ? (
        <a
          href={`mailto:${contact.email}`}
          style={{ color: 'inherit', textDecoration: 'underline' }}
        >
          {label}
        </a>
      ) : (
        label
      )}{' '}
      for late-entry help.
    </span>
  );
}
