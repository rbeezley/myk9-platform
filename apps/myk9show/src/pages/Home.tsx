import { useEffect } from 'react';
import {
  LandingHeader,
  LandingHero,
  LifecycleTimeline,
  TrustSection,
  LandingClose,
  LandingFooter,
} from '@/components/landing/lifecycle';
import { ShowTodayBanner } from '@/features/show-today/ShowTodayBanner';
import { useAuthContext } from '@/hooks/useAuthContext';

const Home: React.FC = () => {
  const { user } = useAuthContext();

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
      <LandingHeader signedIn={Boolean(user)} />
      <ShowTodayBanner />
      <LandingHero />
      <LifecycleTimeline />
      <TrustSection />
      <LandingClose />
      <LandingFooter />
    </div>
  );
};

export default Home;
