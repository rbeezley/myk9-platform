import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Hero from '@/components/landing/Hero';
import FeaturesSection from '@/components/landing/FeaturesSection';
import FAQSection from '@/components/landing/FAQSection';
import DelightfulLoading from '@/components/ui/DelightfulLoading';
import features from '@/data/features';
import upcomingShows from '@/data/upcomingShows';
import faqs from '@/data/faqs';

// Lazy load heavy components to improve initial page load
const ShowCreationWizard = React.lazy(() => 
  import('@/components/shows/wizard/ShowCreationWizard').then(module => ({
    default: module.ShowCreationWizard
  }))
);

const UpcomingShows = React.lazy(() => 
  import('@/components/shows').then(module => ({
    default: module.UpcomingShows
  }))
);

const Home: React.FC = () => {
  const [showWizardOpen, setShowWizardOpen] = useState(false);

  // No automatic redirects on home page - let users choose where to go
  
  // Handle wizard query parameter from command palette
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('wizard') === 'true') {
      queueMicrotask(() => {
        setShowWizardOpen(true);
      });
      // Don't clean up URL immediately - let the wizard open first
    }
  }, []);
  
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

      {/* Show Creation Wizard - Lazy loaded with magical loading */}
      {showWizardOpen && (
        <Suspense fallback={<DelightfulLoading variant="wizard" />}>
          <ShowCreationWizard
            open={showWizardOpen}
            onOpenChange={setShowWizardOpen}
          />
        </Suspense>
      )}
      
      
    </div>
  );
};

export default Home;
