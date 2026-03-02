// INTENT: Two tiers only — Free (results log) and Premium ($4.99/mo, all 5 capabilities).
// Per-person subscription, not per-dog. Matches exhibitor_profiles.subscription_tier in DB.
export type PlanType = 'free' | 'premium';

export type FeatureType =
  | 'title_tracking'
  | 'health_records'
  | 'training_journal'
  | 'pedigree'
  | 'manual_results'
  | 'performance_stats';

export interface Feature {
  id: FeatureType;
  name: string;
  description: string;
  requiredPlan: PlanType;
  icon?: React.ReactNode;
}

export const features: Record<FeatureType, Feature> = {
  title_tracking: {
    id: 'title_tracking',
    name: 'Title Tracking',
    description: 'Track title progress across AKC, UKC, and ASCA competitions',
    requiredPlan: 'premium',
  },
  health_records: {
    id: 'health_records',
    name: 'Health Records',
    description: 'Manage vaccinations, health screenings, and genetic tests',
    requiredPlan: 'premium',
  },
  training_journal: {
    id: 'training_journal',
    name: 'Training Journal',
    description: "Log training sessions and track your dog's progress",
    requiredPlan: 'premium',
  },
  pedigree: {
    id: 'pedigree',
    name: 'Pedigree',
    description: "View and manage your dog's three-generation pedigree",
    requiredPlan: 'premium',
  },
  manual_results: {
    id: 'manual_results',
    name: 'Historical Results',
    description: 'Enter results from trials not run on the platform',
    requiredPlan: 'premium',
  },
  performance_stats: {
    id: 'performance_stats',
    name: 'Performance Statistics',
    description: 'View Q rates, time trends, and element breakdowns',
    requiredPlan: 'premium',
  },
};

export const planHierarchy: Record<PlanType, number> = {
  free: 0,
  premium: 1,
};

export const planDetails: Record<
  PlanType,
  {
    name: string;
    price: string;
    features: string[];
    color: string;
  }
> = {
  free: {
    name: 'Free',
    price: '$0',
    features: [
      'Competition results log',
      'Show browsing & entry',
      'Dog profiles',
      'Digital scorecards',
      'Show calendar',
    ],
    color: 'gray',
  },
  premium: {
    name: 'Premium',
    price: '$4.99/month',
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
    color: 'amber',
  },
};

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
      showUpgrade: !hasAccess && showUpgrade,
    };
  };

  return {
    hasFeature,
    getRequiredPlan,
    canUseFeature,
    planHierarchy,
    userPlan,
  };
}
