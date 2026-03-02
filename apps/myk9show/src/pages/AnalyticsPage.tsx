import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';
import { FeatureGate } from '@/components/subscription/FeatureGate';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';

export default function AnalyticsPage() {
  const { tier } = useSubscriptionGate();

  return (
    <div className="min-h-screen pt-8 pb-8 px-6 max-w-[90rem] mx-auto">
      <FeatureGate feature="performance_stats" userPlan={tier} showDialog={false}>
        <AnalyticsDashboard />
      </FeatureGate>
    </div>
  );
}
