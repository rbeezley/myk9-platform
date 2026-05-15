import { useCallback, useRef } from 'react';
import {
  LandingHeader,
  HeroPhotoLed,
  TaglineStrip,
  CredibilityBand,
  ClubFeatures,
  ExhibitorFeatures,
  OfflineCallout,
  ClosingWaitlist,
  LandingFooter,
} from '@/components/landing/v2';

const Home: React.FC = () => {
  const closingRef = useRef<HTMLElement>(null);

  const scrollToWaitlist = useCallback(() => {
    const node = closingRef.current ?? document.getElementById('closing');
    if (!node) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    node.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });

    const emailInput = node.querySelector<HTMLInputElement>('#l-wl-closing');
    if (!emailInput) return;

    if (reducedMotion) {
      // No animation to wait for — focus immediately.
      emailInput.focus({ preventScroll: true });
      return;
    }

    // Prefer scrollend (instant + accurate) when the browser supports it;
    // fall back to a conservative timeout for Safari < 17 / older Chromium.
    const supportsScrollEnd = 'onscrollend' in window;
    if (supportsScrollEnd) {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('scrollend', finish);
        emailInput.focus({ preventScroll: true });
      };
      window.addEventListener('scrollend', finish, { once: true });
      // Belt-and-braces: if scrollend never fires (very short scroll, etc.),
      // resolve the focus anyway after a generous window.
      window.setTimeout(finish, 800);
    } else {
      window.setTimeout(() => emailInput.focus({ preventScroll: true }), 320);
    }
  }, []);

  return (
    <div className="landing-v2">
      <LandingHeader onJoinWaitlistClick={scrollToWaitlist} />
      <HeroPhotoLed />
      <TaglineStrip />
      <CredibilityBand />
      <ClubFeatures />
      <ExhibitorFeatures />
      <OfflineCallout />
      <ClosingWaitlist ref={closingRef} />
      <LandingFooter />
    </div>
  );
};

export default Home;
