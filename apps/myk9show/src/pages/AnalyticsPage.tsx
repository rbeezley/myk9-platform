import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';
import { FeatureGate } from '@/components/subscription/FeatureGate';

// Mock user plan - in real app this would come from user's subscription
const mockUserPlan = 'premium'; // 'free' | 'basic' | 'premium' | 'enterprise'

export default function AnalyticsPage() {

  return (
    <div className="min-h-screen pt-20 pb-8 px-6 max-w-[90rem] mx-auto">
      <FeatureGate 
        feature="analytics" 
        userPlan={mockUserPlan}
        showDialog={false}
      >
        <AnalyticsDashboard />
      </FeatureGate>
    </div>
  );
}