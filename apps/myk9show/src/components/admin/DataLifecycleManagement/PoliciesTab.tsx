/**
 * Policies tab panel – displays retention policies and their status.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PoliciesTabProps } from './types';

export function PoliciesTab({ policies }: PoliciesTabProps) {
  return (
    <div className="space-y-6">
      <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
        <CardHeader>
          <CardTitle>Retention Policies</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {policies.map(policy => (
              <div key={policy.id} className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{policy.name}</h4>
                  <Badge variant={policy.isActive ? "default" : "secondary"}>
                    {policy.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  {policy.description}
                </p>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    Data Types: {policy.dataTypes.join(', ')}
                  </span>
                  <span className="text-muted-foreground">
                    Priority: {policy.priority}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
