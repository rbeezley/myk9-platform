import React, { useMemo, Suspense } from 'react';
import Hero from '@/components/landing/Hero';
import FeaturesSection from '@/components/landing/FeaturesSection';
import HowItWorks from '@/components/landing/HowItWorks';
import MyK9QCallout from '@/components/landing/MyK9QCallout';
import Pricing from '@/components/landing/Pricing';
import ClubOnboardingForm from '@/components/landing/ClubOnboardingForm';
import FAQSection from '@/components/landing/FAQSection';
import LandingFooter from '@/components/landing/LandingFooter';
import DelightfulLoading from '@/components/ui/DelightfulLoading';
import features from '@/data/features';
import faqs from '@/data/faqs';
import { useUpcomingShowsQuery } from '@/hooks/queries/useShowsDatabase';
import { FadeIn } from '@/components/layout/FadeIn';

const UpcomingShows = React.lazy(() =>
  import('@/components/shows').then(module => ({
    default: module.UpcomingShows,
  }))
);

const Home: React.FC = () => {
  const memoizedFeatures = useMemo(() => features, []);
  const memoizedFaqs = useMemo(() => faqs, []);

  const { data: dbShows, isLoading: showsLoading } = useUpcomingShowsQuery(5);
  const shows = dbShows || [];

  // Show the same beautiful landing page for everyone
  return (
    <div className="min-h-screen bg-background">
      <Hero />

      {/* Upcoming Shows - moved up to prove value immediately */}
      <FadeIn>
        <div className="py-16 bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Suspense fallback={<DelightfulLoading variant="carousel" />}>
              <UpcomingShows
                shows={shows}
                variant="carousel"
                className="mt-8"
                isLoading={showsLoading}
                isEmpty={!showsLoading && shows.length === 0}
              />
            </Suspense>
          </div>
        </div>
      </FadeIn>

      {/* How It Works */}
      <FadeIn>
        <HowItWorks />
      </FadeIn>

      {/* Features Section */}
      <FadeIn>
        <FeaturesSection features={memoizedFeatures} />
      </FadeIn>

      {/* myK9Q Companion App */}
      <FadeIn>
        <MyK9QCallout />
      </FadeIn>

      {/* Pricing Section */}
      <FadeIn>
        <Pricing />
      </FadeIn>

      {/* Club Onboarding Form */}
      <FadeIn>
        <ClubOnboardingForm />
      </FadeIn>

      {/* FAQ Section */}
      <FadeIn>
        <FAQSection faqs={memoizedFaqs} />
      </FadeIn>

      <LandingFooter />
    </div>
  );
};

export default Home;
