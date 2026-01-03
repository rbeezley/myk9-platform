export type PlanType = 'free' | 'basic' | 'premium' | 'enterprise';
export type FeatureType = 'shows' | 'dogs' | 'reports' | 'analytics' | 'api' | 'support';

export interface Feature {
  id: FeatureType;
  name: string;
  description: string;
  requiredPlan: PlanType;
  icon?: React.ReactNode;
}

export const features: Record<FeatureType, Feature> = {
  shows: {
    id: 'shows',
    name: 'Unlimited Shows',
    description: 'Create and manage unlimited dog shows',
    requiredPlan: 'premium'
  },
  dogs: {
    id: 'dogs',
    name: 'Unlimited Dogs',
    description: 'Register unlimited dogs in your account',
    requiredPlan: 'basic'
  },
  reports: {
    id: 'reports',
    name: 'Advanced Reports',
    description: 'Generate detailed analytics and custom reports',
    requiredPlan: 'premium'
  },
  analytics: {
    id: 'analytics',
    name: 'Analytics Dashboard',
    description: 'Track performance metrics and insights',
    requiredPlan: 'premium'
  },
  api: {
    id: 'api',
    name: 'API Access',
    description: 'Integrate with third-party applications',
    requiredPlan: 'enterprise'
  },
  support: {
    id: 'support',
    name: 'Priority Support',
    description: '24/7 priority customer support',
    requiredPlan: 'enterprise'
  }
};

export const planHierarchy: Record<PlanType, number> = {
  free: 0,
  basic: 1,
  premium: 2,
  enterprise: 3
};

export const planDetails = {
  basic: {
    name: 'Basic',
    price: '$9/month',
    features: ['Up to 5 shows', 'Up to 50 dogs', 'Basic reports', 'Email support'],
    color: 'blue'
  },
  premium: {
    name: 'Premium',
    price: '$29/month',
    features: ['Unlimited shows', 'Unlimited dogs', 'Advanced reports', 'Analytics dashboard', 'Priority support'],
    color: 'amber'
  },
  enterprise: {
    name: 'Enterprise',
    price: '$99/month',
    features: ['Everything in Premium', 'API access', 'Custom integrations', '24/7 support', 'Dedicated account manager'],
    color: 'purple'
  }
};

// Hook for easy feature checking
export function useFeatureAccess(userPlan: PlanType = 'free') {
  const hasFeature = (feature: FeatureType) => {
    const featureConfig = features[feature];
    return planHierarchy[userPlan] >= planHierarchy[featureConfig.requiredPlan];
  };

  const getRequiredPlan = (feature: FeatureType) => {
    return features[feature].requiredPlan;
  };

  const canUseFeature = (feature: FeatureType, showUpgrade = false) => {
    const hasAccess = hasFeature(feature);
    return {
      hasAccess,
      requiredPlan: getRequiredPlan(feature),
      showUpgrade: !hasAccess && showUpgrade
    };
  };

  return {
    hasFeature,
    getRequiredPlan,
    canUseFeature,
    planHierarchy,
    userPlan
  };
}