import { AlertTriangle } from 'lucide-react';
import type { EntryBlankProps } from './types';

/**
 * MYK9-90 task 3.4 — the operator-facing half of the paperwork fix.
 *
 * `buildEntryBlankProps` sets `dog.missingRegistration` when a dog was supplied
 * but holds no registration with the trial's sanctioning organization, which
 * means §I's registered name, breed, variety, and registration number all print
 * blank. A blank registration number on a form mailed to a sanctioning body is
 * a rejected entry, so the flag has to reach a human BEFORE they download and
 * mail it — a flag nothing renders is the original defect moved up a layer.
 *
 * Rendered by every entry-blank download button, above the download control.
 * Deliberately does NOT block the download: a secretary may legitimately want
 * the partly-filled form to hand to an exhibitor to complete by hand. The
 * requirement is that nobody mails it *unknowingly*.
 *
 * Plain DOM (not `@react-pdf/renderer`), because it renders in the app next to
 * the button rather than inside the generated PDF.
 */
export function MissingRegistrationNotice({
  dog,
  className,
}: {
  dog: Pick<EntryBlankProps['dog'], 'missingRegistration'>;
  className?: string;
}) {
  if (!dog.missingRegistration) return null;

  return (
    <div
      role="alert"
      className={[
        'mb-2 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3',
        'text-sm text-warning',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-medium">This dog has no registration for this trial’s organization.</p>
        <p>
          The registered name, breed, and registration number will print blank. Sanctioning
          organizations reject entries with a missing registration number — add the registration to
          the dog, or have the exhibitor complete those fields by hand before mailing.
        </p>
      </div>
    </div>
  );
}
