import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';
import { FeatureGate } from '@/components/subscription/FeatureGate';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';

export default function AnalyticsPage() {
  const { profile } = useExhibitorProfile();
  const userPlan = profile?.subscription_tier ?? 'free';

  return (
    <div className="min-h-screen pt-8 pb-8 px-6 max-w-[90rem] mx-auto">
      <FeatureGate feature="performance_stats" userPlan={userPlan} showDialog={false}>
        <AnalyticsDashboard />
      </FeatureGate>
    </div>
  );
}
