import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { products } from '@/stripe-config';
import { createCheckoutSession } from '@/lib/stripe';
import { useAuthContext } from '@/hooks/useAuthContext';
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

export default function Pricing() {
  const { user } = useAuthContext();
  const navigate = useNavigate();

  const handleSubscribe = useCallback(
    async (priceId: string) => {
      if (!user) {
        navigate('/sign-in');
        return;
      }

      try {
        await createCheckoutSession(priceId, 'subscription');
      } catch (error) {
        toast.error('Something went wrong. Please try again.');
        logger.error('Failed to create checkout session:', 'landing', {}, error as Error);
      }
    },
    [user, navigate]
  );

  return (
    <section id="pricing" className="py-16 md:py-24 bg-muted/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            Free to start. Premium when you're ready.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {tiers.map(tier => (
            <div
              key={tier.name}
              className={`relative bg-card rounded-2xl shadow-lg ${
                tier.popular ? 'border-2 border-primary' : 'border border-border'
              }`}
            >
              <div className="absolute -top-4 left-0 right-0 flex justify-center">
                <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium">
                  {tier.label}
                </span>
              </div>

              <div className="p-8">
                <h3 className="text-2xl font-bold text-foreground mb-2">{tier.name}</h3>
                <div className="flex items-baseline mb-2">
                  <span className="text-4xl font-bold text-foreground">{tier.price}</span>
                  {tier.period && <span className="ml-1 text-muted-foreground">{tier.period}</span>}
                </div>
                <p className="text-muted-foreground mb-6">{tier.description}</p>

                <button
                  onClick={() =>
                    tier.priceId ? handleSubscribe(tier.priceId) : navigate('/sign-up')
                  }
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
          ))}
        </div>
      </div>
    </section>
  );
}
