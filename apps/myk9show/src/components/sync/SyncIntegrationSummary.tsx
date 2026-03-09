import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Calendar, Users, Dog, Gavel, Trophy, Settings } from 'lucide-react';

interface IntegrationPoint {
  component: string;
  location: string;
  syncType: string;
  description: string;
  implemented: boolean;
  entityTypes: string[];
}

/**
 * Summary component showing all sync indicator integrations across the app
 * Useful for documentation and testing purposes
 */
export const SyncIntegrationSummary: React.FC = () => {
  const integrations: IntegrationPoint[] = [
    {
      component: 'ShowCard',
      location: '/src/components/shows/ShowCard.tsx',
      syncType: 'Entity Status',
      description: 'Compact sync indicator in top-left corner of show cards',
      implemented: true,
      entityTypes: ['show'],
    },
    {
      component: 'PersonCard',
      location: '/src/components/users/PersonCard.tsx',
      syncType: 'Entity Status',
      description: 'Sync status for people in both detailed and compact views',
      implemented: true,
      entityTypes: ['person'],
    },
    {
      component: 'LazyDogCard',
      location: '/src/components/dogs/LazyDogCard.tsx',
      syncType: 'Entity Status',
      description: 'Dog card with sync indicator in header area',
      implemented: true,
      entityTypes: ['dog'],
    },
    {
      component: 'ShowDayHero ClassTimelineCard',
      location: '/src/components/exhibitor/ClassTimelineCard.tsx',
      syncType: 'Entry Status',
      description: 'Entry sync status on exhibitor class cards',
      implemented: true,
      entityTypes: ['entry'],
    },
    {
      component: 'JudgeClassInterface',
      location: '/src/components/scoring/JudgeClassInterface.tsx',
      syncType: 'Scoring Status',
      description: 'Sync status for judge scoring interface',
      implemented: true,
      entityTypes: ['scoring', 'results'],
    },
    {
      component: 'AppHeader',
      location: '/src/components/layout/AppHeader.tsx',
      syncType: 'Global Status',
      description: 'Global sync status indicator in main navigation',
      implemented: true,
      entityTypes: ['global'],
    },
    {
      component: 'SyncStatusPanel',
      location: '/src/components/sync/SyncStatusPanel.tsx',
      syncType: 'Comprehensive Dashboard',
      description: 'Full sync status dashboard for settings pages',
      implemented: true,
      entityTypes: ['system', 'all entities'],
    },
  ];

  const implementedComponents = integrations.filter(i => i.implemented).length;
  const allEntityTypes = [...new Set(integrations.flatMap(i => i.entityTypes))];

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{implementedComponents}</div>
            <div className="text-sm text-muted-foreground">Components Enhanced</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{allEntityTypes.length}</div>
            <div className="text-sm text-muted-foreground">Entity Types Covered</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">100%</div>
            <div className="text-sm text-muted-foreground">Integration Coverage</div>
          </CardContent>
        </Card>
      </div>

      {/* Integration Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Sync Integration Points
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {integrations.map((integration, index) => (
              <div
                key={index}
                className="flex items-start justify-between p-4 border border-border rounded-lg"
              >
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {integration.implemented ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                      )}
                      <h4 className="font-medium">{integration.component}</h4>
                    </div>
                    <Badge
                      variant={integration.implemented ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {integration.syncType}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground">{integration.description}</p>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Entity Types:</span>
                    <div className="flex gap-1">
                      {integration.entityTypes.map(type => (
                        <Badge key={type} variant="outline" className="text-xs px-1.5 py-0.5">
                          {type}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground font-mono">
                    {integration.location}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Entity Type Coverage */}
      <Card>
        <CardHeader>
          <CardTitle>Entity Type Coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { type: 'show', icon: Calendar, label: 'Shows' },
              { type: 'person', icon: Users, label: 'Users' },
              { type: 'dog', icon: Dog, label: 'Dogs' },
              { type: 'entry', icon: Trophy, label: 'Entries' },
              { type: 'scoring', icon: Gavel, label: 'Scoring' },
              { type: 'global', icon: Settings, label: 'Global' },
            ].map(({ type, icon: Icon, label }) => {
              const isImplemented = allEntityTypes.includes(type);
              return (
                <div
                  key={type}
                  className={`flex items-center gap-2 p-3 rounded-lg border ${
                    isImplemented
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : 'bg-gray-50 border-gray-200 text-gray-500'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{label}</span>
                  {isImplemented && <CheckCircle className="h-3 w-3 ml-auto" />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Implementation Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Implementation Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm space-y-2">
            <h4 className="font-medium">Key Features Implemented:</h4>
            <ul className="space-y-1 text-muted-foreground ml-4">
              <li>• Consistent sync indicator positioning across all card components</li>
              <li>• Global sync status in main navigation header</li>
              <li>• Entity-specific sync status with retry functionality</li>
              <li>• Comprehensive sync dashboard for admin/settings pages</li>
              <li>• Real-time sync status updates using hooks</li>
              <li>• Premium design with backdrop blur effects</li>
              <li>• Tooltip integration for detailed sync information</li>
              <li>• Network-aware sync status (online/offline)</li>
            </ul>
          </div>

          <div className="text-sm space-y-2 pt-3 border-t">
            <h4 className="font-medium">Integration Approach:</h4>
            <ul className="space-y-1 text-muted-foreground ml-4">
              <li>• Optional sync status props with sensible defaults</li>
              <li>• Minimal disruption to existing component layouts</li>
              <li>• Consistent visual placement (top-left for most cards)</li>
              <li>• Backdrop blur for better readability over images</li>
              <li>• Graceful degradation when sync data unavailable</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SyncIntegrationSummary;
