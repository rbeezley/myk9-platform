import React from 'react';
import { Link } from 'react-router-dom';

interface NoRegistrationNumberHelpProps {
  /**
   * The show being entered. Known in the entry wizard, where this is one tap to
   * the existing message thread with that show's secretary. Unknown when Add
   * Dog opens from My Dogs, where the line can only say whom to ask.
   */
  showId?: string | undefined;
  /** Keeps a half-filled form alive: the Add Dog panel opens the thread in a new tab. */
  opensInNewTab?: boolean | undefined;
  className?: string | undefined;
}

/**
 * The way out of the registration rule (MYK9-1162, MYK9-1963): an exhibitor
 * cannot enter a dog with no number for the show's registry, but the show's
 * secretary can enter it and hold its place until the number arrives. Says so
 * beside the message that stopped her, and links the secretary's message thread
 * (`/messages/:showId`, the surface "Message the show secretary" already opens
 * everywhere else) rather than building a contact surface of its own.
 */
export const NoRegistrationNumberHelp: React.FC<NoRegistrationNumberHelpProps> = ({
  showId,
  opensInNewTab = false,
  className,
}) => {
  const holdsItsPlace = ', who can enter your dog and hold its place until the number arrives.';

  if (!showId) {
    return (
      <p className={className}>
        Number not issued yet? Ask the secretary of the show you want to enter
        {holdsItsPlace}
      </p>
    );
  }

  return (
    <p className={className}>
      Number not issued yet?{' '}
      <Link
        to={`/messages/${showId}`}
        className="font-medium underline underline-offset-2"
        {...(opensInNewTab && { target: '_blank', rel: 'noopener noreferrer' })}
      >
        Message the show secretary
      </Link>
      {holdsItsPlace}
    </p>
  );
};
