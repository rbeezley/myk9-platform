import { forwardRef } from 'react';
import { WaitlistFormLanding } from './WaitlistFormLanding';

export const ClosingWaitlist = forwardRef<HTMLElement>((_props, ref) => {
  return (
    <section className="l-closing" id="closing" ref={ref}>
      <div className="l-container">
        <span className="l-eyebrow">Joining the waitlist</span>
        <h2>
          Be in the room when <em>the first trial</em> goes live.
        </h2>
        <p>
          We're shipping to a handful of clubs across AKC, UKC, and ASCA in late 2026. Tell us
          who you are and we'll keep you in the loop — no spam, no hype.
        </p>
        <WaitlistFormLanding emailInputId="l-wl-closing" />
      </div>
    </section>
  );
});

ClosingWaitlist.displayName = 'ClosingWaitlist';
