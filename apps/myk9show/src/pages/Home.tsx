import { Suspense, useEffect, useState } from 'react';
import {
  LandingHeader,
  LandingHero,
  LifecycleTimeline,
  TrustSection,
  ClubOverviewVideo,
  PricingSection,
  FaqSection,
  LandingClose,
  LandingFooter,
} from '@/components/landing/lifecycle';
import { ctaAudience } from '@/components/landing/lifecycle/landingCtas';
import { DEFAULT_AUDIENCE, type Audience } from '@/components/landing/lifecycle/lifecycleStories';
import { useAuthContext } from '@/hooks/useAuthContext';
import { lazyWithRetry } from '@/utils/lazyWithRetry';

// The banner lists the signed-in account's entries for today, so a guest never sees it. Loading
// it on demand keeps its replicated-table reads out of a first-time visitor's page (MYK9-2140).
const ShowTodayBanner = lazyWithRetry(() =>
  import('@/features/show-today/ShowTodayBanner').then(module => ({
    default: module.ShowTodayBanner,
  }))
);

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
      {signedIn && (
        <Suspense fallback={null}>
          <ShowTodayBanner />
        </Suspense>
      )}
      <LandingHero showSignUp={!signedIn} />
      <TrustSection />
      {audience === 'club' && <ClubOverviewVideo />}
      <LifecycleTimeline audience={audience} onAudienceChange={setAudience} />
      <PricingSection />
      <FaqSection />
      <LandingClose audience={ctas} />
      <LandingFooter />
    </div>
  );
};

export default Home;
