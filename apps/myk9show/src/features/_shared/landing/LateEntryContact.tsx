import { useContext } from 'react';
import { LateEntryContactContext } from './lateEntryContactContext';

/** The closed-entries contact sentence; the one copy every landing style renders. */
export function LateEntryContact() {
  const contact = useContext(LateEntryContactContext);
  if (contact === undefined) return <>Contact the trial secretary for late-entry help.</>;
  if (contact === null) return <>The club has not listed a secretary yet.</>;
  const label = contact.name ?? contact.email;
  return (
    <>
      Contact{' '}
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
    </>
  );
}
