import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { UserMetrics } from './user-activity-types';

interface UserActivityFeaturesTabProps {
  userMetrics: UserMetrics;
}

export function UserActivityFeaturesTab({ userMetrics }: UserActivityFeaturesTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature Usage Analytics</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={userMetrics.mostUsedFeatures}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="feature" angle={-45} textAnchor="end" height={80} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="usage" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
