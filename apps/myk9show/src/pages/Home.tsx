import { useEffect, useState } from 'react';
import {
  LandingHeader,
  LandingHero,
  LifecycleTimeline,
  TrustSection,
  LandingClose,
  LandingFooter,
} from '@/components/landing/lifecycle';
import { ctaAudience } from '@/components/landing/lifecycle/landingCtas';
import { DEFAULT_AUDIENCE, type Audience } from '@/components/landing/lifecycle/lifecycleStories';
import { ShowTodayBanner } from '@/features/show-today/ShowTodayBanner';
import { useAuthContext } from '@/hooks/useAuthContext';

const Home: React.FC = () => {
  const { user } = useAuthContext();
  const signedIn = Boolean(user);
  // The story switch also decides which calls to action the header and close lead with,
  // except that a signed-in visitor (who already has an account) always gets the club ones.
  const [audience, setAudience] = useState<Audience>(DEFAULT_AUDIENCE);
  const ctas = ctaAudience(audience, signedIn);

  useEffect(() => {
    if (window.location.hash !== '#get-started') return;
    const target = document.getElementById('get-started');
    if (!target) return;

    const frame = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="landing-v2" data-guest={user ? 'false' : 'true'}>
      <LandingHeader signedIn={signedIn} audience={ctas} />
      <ShowTodayBanner />
      <LandingHero showSignUp={!signedIn} />
      <LifecycleTimeline audience={audience} onAudienceChange={setAudience} />
      <TrustSection />
      <LandingClose audience={ctas} />
      <LandingFooter />
    </div>
  );
};

export default Home;
