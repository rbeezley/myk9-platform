import React, { useMemo, Suspense } from 'react';
import Hero from '@/components/landing/Hero';
import FeaturesSection from '@/components/landing/FeaturesSection';
import Pricing from '@/components/landing/Pricing';
import FAQSection from '@/components/landing/FAQSection';
import DelightfulLoading from '@/components/ui/DelightfulLoading';
import features from '@/data/features';
import faqs from '@/data/faqs';
import { useUpcomingShowsQuery } from '@/hooks/queries/useShowsDatabase';

const UpcomingShows = React.lazy(() =>
  import('@/components/shows').then(module => ({
    default: module.UpcomingShows,
  }))
);

const Home: React.FC = () => {
  const memoizedFeatures = useMemo(() => features, []);
  const memoizedFaqs = useMemo(() => faqs, []);

  const { data: dbShows, isLoading: showsLoading } = useUpcomingShowsQuery(5);

  const mappedShows = useMemo(
    () =>
      (dbShows || []).map(show => ({
        id: show.id,
        title: show.name,
        date:
          show.startDate && show.endDate
            ? `${new Date(show.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(show.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : show.startDate
              ? new Date(show.startDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'TBD',
        location: show.location || 'Location TBD',
        imageUrl: '',
        organization: show.organization,
        status: show.status,
      })),
    [dbShows]
  );

  // Show the same beautiful landing page for everyone
  return (
    <div className="min-h-screen bg-background">
      <Hero />

      {/* Features Section */}
      <FeaturesSection features={memoizedFeatures} />

      {/* Upcoming Shows - Lazy loaded with delightful loading */}
      <div className="py-16 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Suspense fallback={<DelightfulLoading variant="carousel" />}>
            <UpcomingShows
              shows={mappedShows}
              variant="carousel"
              className="mt-8"
              isLoading={showsLoading}
              isEmpty={!showsLoading && mappedShows.length === 0}
            />
          </Suspense>
        </div>
      </div>

      {/* Pricing Section */}
      <Pricing />

      {/* FAQ Section */}
      <FAQSection faqs={memoizedFaqs} />
    </div>
  );
};

export default Home;
