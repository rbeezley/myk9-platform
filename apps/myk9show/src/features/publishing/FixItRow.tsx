import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const FIX_LINK_CLASS =
  'inline-flex min-h-11 items-center font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface FixItRowProps {
  message: string;
  /** Opens the place to fix it. A row with neither `href` nor `onFix` is a statement only. */
  href?: string | undefined;
  onFix?: (() => void) | undefined;
  /** A second muted line under the message (who a line waits on). */
  note?: ReactNode;
}

/**
 * One "message, then Fix it" row, shared by the premium requirements notice and the publish
 * blockers list so the two read and behave alike.
 */
export function FixItRow({ message, href, onFix, note }: FixItRowProps) {
  const label = `Fix it: ${message}`;
  return (
    <li className="flex flex-wrap items-center gap-x-2">
      <span>
        {message}
        {note ? <span className="block text-muted-foreground">{note}</span> : null}
      </span>
      {href ? (
        <Link to={href} aria-label={label} className={FIX_LINK_CLASS}>
          Fix it
        </Link>
      ) : onFix ? (
        <button type="button" onClick={onFix} aria-label={label} className={FIX_LINK_CLASS}>
          Fix it
        </button>
      ) : null}
    </li>
  );
}
