import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { products, annualPriceId } from '../stripe-config';
import { createCheckoutSession } from '../lib/stripe';
import { useAuthContext } from '@/hooks/useAuthContext';
import AppHeader from '../components/layout/AppHeader';
import Footer from '../components/layout/Footer';
import { logger } from '@/services/LoggingService';

// INTENT: Two tiers only — Free (results log) and Premium ($4.99/mo, all capabilities).
// Per-person subscription, not per-dog.
const tiers = [
  {
    name: 'Free',
    price: 'Free',
    period: '',
    description: 'Competition results log — see what happened at every trial',
    features: [
      'Show browsing & entry',
      'Competition results log',
      'Dog profiles',
      'Digital scorecards',
      'Show calendar',
      'Email support',
    ],
    buttonText: 'Get Started',
    buttonVariant: 'outline',
    popular: false,
    label: 'Everyone',
    priceId: null,
  },
  {
    name: 'Premium',
    price: '$4.99',
    period: '/month',
    description: 'Intelligence layer — track titles, health, training, and more',
    features: [
      'Everything in Free',
      'Title tracking engine',
      'Historical result entry',
      'Health records & vaccinations',
      'Training journal',
      'Pedigree management',
      'Performance statistics',
      'Priority support',
    ],
    buttonText: 'Subscribe Now',
    buttonVariant: 'solid',
    popular: true,
    label: 'Exhibitors',
    priceId: products.premium.priceId,
  },
];

export default function PricingPage() {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  // Annual exists only when VITE_STRIPE_PRICE_ANNUAL is configured; the
  // toggle hides entirely otherwise (premium launch plan, Task 3).
  // INVARIANT: the Stripe annual price MUST be $49.00/yr (unit_amount=4900) —
  // the display below is a literal. Change both together.
  const [interval, setBillingInterval] = useState<'month' | 'year'>('month');
  const annualActive = interval === 'year' && !!annualPriceId;
  // Imperative in-flight latch: React Query-style isPending lags within the
  // same sync callback, so a double-click would start two checkout sessions.
  const checkoutInFlightRef = useRef(false);

  const handleSubscribe = useCallback(
    async (priceId: string | null) => {
      if (!priceId) {
        // Handle free tier signup
        return;
      }

      if (!user) {
        // Redirect to sign-in page using navigate instead of window.location
        navigate('/sign-in');
        return;
      }

      if (checkoutInFlightRef.current) return;
      checkoutInFlightRef.current = true;
      try {
        await createCheckoutSession(priceId, 'subscription');
      } catch (error) {
        logger.error('Failed to create checkout session:', 'pages', {}, error as Error);
        toast.error('Could not start checkout. Please try again.');
      } finally {
        checkoutInFlightRef.current = false;
      }
    },
    [user, navigate]
  );

  return (
    <>
      <AppHeader />
      {/* Add global background and text color wrapper for dark/light mode support */}
      <div className="bg-background text-foreground min-h-screen transition-colors duration-300">
        <main>
          <section className="py-16 md:py-24 bg-background">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center max-w-3xl mx-auto mb-16">
                <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
                  Simple, Transparent Pricing
                </h1>
                <p className="text-xl text-muted-foreground">
                  Choose the perfect plan for your dog show management needs
                </p>
              </div>

              {annualPriceId && (
                <div className="mb-10 flex items-center justify-center gap-2">
                  <div className="inline-flex rounded-full border bg-card p-1">
                    <button
                      onClick={() => setBillingInterval('month')}
                      aria-pressed={interval === 'month'}
                      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                        interval === 'month'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground'
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setBillingInterval('year')}
                      aria-pressed={interval === 'year'}
                      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                        interval === 'year'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground'
                      }`}
                    >
                      Annual <span className="font-normal">— 2 months free</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                {tiers.map(tier => {
                  const isPaidTier = tier.priceId !== null;
                  const price = isPaidTier && annualActive ? '$49' : tier.price;
                  const period = isPaidTier && annualActive ? '/year' : tier.period;
                  const priceId = isPaidTier && annualActive ? annualPriceId! : tier.priceId;
                  return (
                  <div
                    key={tier.name}
                    className="relative bg-card rounded-2xl shadow-lg border border-primary"
                  >
                    <div className="absolute -top-4 left-0 right-0 flex justify-center">
                      <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium">
                        {tier.label}
                      </span>
                    </div>

                    <div className="p-8">
                      <h3 className="text-2xl font-bold text-foreground mb-2">{tier.name}</h3>
                      <div className="flex items-baseline mb-2">
                        <span className="text-4xl font-bold text-foreground">{price}</span>
                        {period && (
                          <span className="ml-1 text-muted-foreground">{period}</span>
                        )}
                      </div>
                      <p className="text-muted-foreground mb-6">{tier.description}</p>

                      <button
                        onClick={() => handleSubscribe(priceId)}
                        className={`w-full py-3 px-6 rounded-xl font-medium transition-colors ${
                          tier.buttonVariant === 'solid'
                            ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                            : 'bg-accent text-accent-foreground hover:bg-accent/80'
                        }`}
                      >
                        {tier.buttonText}
                      </button>

                      <ul className="mt-8 space-y-4">
                        {tier.features.map(feature => (
                          <li key={feature} className="flex items-start text-muted-foreground">
                            <Check
                              size={20}
                              className="mr-2 flex-shrink-0 text-blue-500 dark:text-blue-400"
                            />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
