import React from 'react';
import {
  CheckCircle,
  Clock,
  Users,
  GitBranch,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { cn } from '../../../lib/utils';
import type { SyncMetrics } from '../../../types/analytics-types';
import { MetricCard } from './MetricCard';

const conflictTypes = [
  { type: "Update-Update", count: 45, color: "bg-blue-500" },
  { type: "Delete-Update", count: 23, color: "bg-red-500" },
  { type: "Create-Create", count: 12, color: "bg-yellow-500" },
  { type: "Schema Mismatch", count: 5, color: "bg-purple-500" }
] as const;

const recentConflictLabels = ["Update conflict", "Delete conflict", "Schema conflict"] as const;
const recentConflictFields = ["Dogs.name", "Shows.date", "Entries.status"] as const;

interface ConflictsTabProps {
  metrics: SyncMetrics;
}

const ConflictsTab: React.FC<ConflictsTabProps> = ({ metrics }) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Auto-Resolved"
          value={`${metrics.resolvedConflicts}`}
          subtitle="Conflicts resolved automatically"
          icon={<CheckCircle className="h-5 w-5" />}
          status="success"
        />
        <MetricCard
          title="Manual Resolution"
          value={`${Math.floor(metrics.totalConflicts * 0.2)}`}
          subtitle="Required user intervention"
          icon={<Users className="h-5 w-5" />}
          status="warning"
        />
        <MetricCard
          title="Pending"
          value={`${Math.floor(metrics.totalConflicts * 0.05)}`}
          subtitle="Awaiting resolution"
          icon={<Clock className="h-5 w-5" />}
          status="error"
        />
      </div>

      {/* Conflict Types */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Conflict Types</CardTitle>
          <CardDescription>Distribution of conflict types</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {conflictTypes.map((conflict) => (
              <div key={conflict.type} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{conflict.type}</span>
                  <span className="text-sm text-muted-foreground">{conflict.count}</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full transition-all duration-500", conflict.color)}
                    style={{ width: `${(conflict.count / 85) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Conflicts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Conflicts</CardTitle>
          <CardDescription>Latest conflict resolutions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      {recentConflictLabels[i % 3]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {recentConflictFields[i % 3]} •
                      {i % 2 === 0 ? " Auto-resolved" : " Manual resolution"}
                    </p>
                  </div>
                </div>
                <Badge variant={i % 2 === 0 ? "default" : "secondary"}>
                  {i % 2 === 0 ? "Resolved" : "Manual"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export { ConflictsTab };
