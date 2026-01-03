import React from 'react';
import { motion } from 'framer-motion';
import { SubscriptionManager } from '@/components/subscription/SubscriptionManager';
import { Card, CardContent } from '@/components/ui/card';
import { CreditCard, Crown, Star } from 'lucide-react';

export default function SubscriptionPage() {
  return (
    <motion.div 
      className="min-h-screen pt-20 pb-8 px-4 sm:px-6 lg:px-8"
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