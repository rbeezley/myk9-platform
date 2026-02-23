import React, { useEffect, useMemo, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import Hero from '@/components/landing/Hero';
import FeaturesSection from '@/components/landing/FeaturesSection';
import FAQSection from '@/components/landing/FAQSection';
import DelightfulLoading from '@/components/ui/DelightfulLoading';
import features from '@/data/features';
import upcomingShows from '@/data/upcomingShows';
import faqs from '@/data/faqs';

const UpcomingShows = React.lazy(() => 
  import('@/components/shows').then(module => ({
    default: module.UpcomingShows
  }))
);

const Home: React.FC = () => {
  const navigate = useNavigate();

  // Handle wizard query parameter from command palette
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('wizard') === 'true') {
      navigate('/secretary/create-show/wizard', { replace: true });
    }
  }, [navigate]);
  
  // Memoize expensive static data to prevent re-computation
  const memoizedFeatures = useMemo(() => features, []);
  const memoizedUpcomingShows = useMemo(() => upcomingShows, []);
  const memoizedFaqs = useMemo(() => faqs, []);
  

  // Show the same beautiful landing page for everyone
  return (
    <div className="min-h-screen bg-background">
      <Hero />

      {/* Features Section */}
      <FeaturesSection features={memoizedFeatures} />

      {/* Upcoming Shows - Lazy loaded with delightful loading */}
      <div className="py-16 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Suspense fallback={
            <DelightfulLoading variant="carousel" />
          }>
            <UpcomingShows 
              shows={memoizedUpcomingShows} 
              variant="carousel"
              className="mt-8"
            />
          </Suspense>
        </div>
      </div>

      {/* FAQ Section */}
      <FAQSection faqs={memoizedFaqs} />
    </div>
  );
};

export default Home;
