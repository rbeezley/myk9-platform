import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { SubscriptionManager } from '@/components/subscription/SubscriptionManager';
import { Card, CardContent } from '@/components/ui/card';
import { CreditCard, Crown, Star, Award, CheckCircle } from 'lucide-react';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';

export default function SubscriptionPage() {
  const { isEarlyAdopter } = useSubscriptionGate();
  const { profile } = useExhibitorProfile();
  const foundingUntil = profile?.person?.early_adopter_until;
  const [searchParams] = useSearchParams();
  // Stripe checkout redirects here with ?checkout=success after payment.
  const justCheckedOut = searchParams.get('checkout') === 'success';

  return (
    <motion.div
      className="pt-6 pb-8 px-4 sm:px-6 lg:px-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold flex items-center justify-center gap-3">
            <CreditCard className="h-8 w-8 text-blue-600" />
            Subscription Management
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your subscription, billing, and account preferences
          </p>
        </div>

        {/* Post-checkout confirmation (Stripe redirect) */}
        {justCheckedOut && (
          <Card className="border-green-500/60">
            <CardContent className="flex items-center gap-3 p-4">
              <CheckCircle className="h-6 w-6 shrink-0 text-green-600" />
              <p className="text-sm">
                <span className="font-semibold">Payment received!</span> Your premium subscription
                is activating — this can take a few seconds. Your plan below will update
                automatically.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Founding member banner */}
        {isEarlyAdopter && foundingUntil && (
          <Card className="border-amber-400/60">
            <CardContent className="flex items-center gap-3 p-4">
              <Award className="h-6 w-6 shrink-0 text-amber-500" />
              <p className="text-sm">
                <span className="font-semibold">Founding member</span> — premium is on us until{' '}
                {new Date(foundingUntil).toLocaleDateString()}. Thank you for being here early.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="p-6 text-center">
              <Star className="h-8 w-8 mx-auto mb-3 text-amber-500" />
              <h3 className="font-semibold">Premium Features</h3>
              <p className="text-sm text-muted-foreground">
                Unlock unlimited shows, advanced analytics, and priority support
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <Crown className="h-8 w-8 mx-auto mb-3 text-purple-500" />
              <h3 className="font-semibold">Enterprise Tools</h3>
              <p className="text-sm text-muted-foreground">
                API access, custom integrations, and dedicated support
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <CreditCard className="h-8 w-8 mx-auto mb-3 text-green-500" />
              <h3 className="font-semibold">Flexible Billing</h3>
              <p className="text-sm text-muted-foreground">
                Monthly or yearly plans with easy cancellation
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Subscription Manager */}
        <SubscriptionManager />
      </div>
    </motion.div>
  );
}
