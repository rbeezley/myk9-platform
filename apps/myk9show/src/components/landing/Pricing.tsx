import { Check } from 'lucide-react';
import { logger } from '@/services/LoggingService';
// import { products } from '../stripe-config';
// import { createCheckoutSession } from '../lib/stripe';
// import { useAuthContext } from '@/hooks/useAuthContext';

const tiers = [
  {
    name: 'Novice',
    price: 'Free',
    period: '',
    description: 'Perfect for getting started with myK9Show',
    features: [
      'Basic show listings',
      'Entry management',
      'Digital scorecards',
      'Basic notifications',
      'Community access',
      'Email support',
      'Show calendar',
    ],
    buttonText: 'Get Started',
    buttonVariant: 'outline',
    popular: false,
    label: 'Free',
    priceId: null,
  },
  {
    name: 'Advanced',
    price: '$4.99',
    period: '/month',
    description: 'Enhanced features for serious exhibitors',
    features: [
      'All Novice features',
      'Competition history tracking',
      'Title progression tracking',
      'Training journal',
      'Advanced entry statistics',
      'Priority support',
      'Premium notifications',
    ],
    buttonText: 'Subscribe Now',
    buttonVariant: 'solid',
    popular: true,
    label: 'Exhibitors',
    priceId: 'price_advanced',
  },
  {
    name: 'Excellent',
    price: '$9.99',
    period: '/month',
    description: 'Premium features for professional organizers',
    features: [
      'All Advanced features',
      'Premium show creation',
      'Advanced analytics & reporting',
      'Priority messaging system',
      'Custom branding options',
      'VIP support',
      'API access',
    ],
    buttonText: 'Subscribe Now',
    buttonVariant: 'outline',
    popular: true,
    label: 'Organizers',
    priceId: 'price_excellent',
  },
];

export default function Pricing() {
  // const { user } = useAuthContext();
  const user = null;

  const handleSubscribe = async (priceId: string | null) => {
    if (!priceId) {
      // Handle free tier signup
      return;
    }

    if (!user) {
      // signIn(); // Commented out to fix lint error. User needs to implement sign-in flow here.
      return;
    }

    try {
      // await createCheckoutSession(priceId, 'subscription');
      logger.debug('Would create checkout session for:', 'landing', { data: priceId });
    } catch (error) {
      logger.error('Failed to create checkout session:', 'components', {}, error as Error);
    }
  };

  return (
    <section id="pricing" className="py-16 md:py-24 bg-gray-50 dark:bg-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-muted-foreground">
            Choose the perfect plan for your dog show management needs
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {tiers.map(tier => (
            <div
              key={tier.name}
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-primary"
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
                  {tier.period && (
                    <span className="ml-1 text-gray-500 dark:text-gray-400">{tier.period}</span>
                  )}
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-6">{tier.description}</p>

                <button
                  onClick={() => handleSubscribe(tier.priceId)}
                  className={`w-full py-3 px-6 rounded-xl font-medium transition-colors ${
                    tier.buttonVariant === 'solid'
                      ? 'bg-primary hover:opacity-90 text-primary-foreground'
                      : 'bg-primary/10 text-primary hover:bg-primary/20'
                  }`}
                >
                  {tier.buttonText}
                </button>

                <ul className="mt-8 space-y-4">
                  {tier.features.map(feature => (
                    <li key={feature} className="flex items-start text-gray-600 dark:text-gray-400">
                      <Check size={20} className="mr-2 flex-shrink-0 text-primary" />
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
