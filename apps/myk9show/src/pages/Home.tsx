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
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const emailInput = node.querySelector<HTMLInputElement>('#l-wl-closing');
    if (emailInput) {
      // Defer focus until smooth-scroll begins so the browser doesn't
      // jump-snap to the input and skip the animation.
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
