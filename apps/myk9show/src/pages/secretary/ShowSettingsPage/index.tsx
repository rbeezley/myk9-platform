/**
 * Show Settings Page
 *
 * Summary page with links to detailed settings pages.
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, UserCheck, Settings, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useShowStore } from '@/store/showStore';
import { useShowSettings } from '@/hooks/queries/useShowSettingsDatabase';
import { PRESET_INFO, type VisibilityPreset } from '@myk9/secretary';
import { WaitListSettingsCard } from '@/components/shows/WaitListSettingsCard';
import { MyK9QAccessCard } from '@/components/secretary/MyK9QAccessCard';

export default function ShowSettingsPage() {
  const { selectedShowId, shows } = useShowStore();
  const navigate = useNavigate();

  const selectedShow = shows.find(s => s.id === selectedShowId) ?? null;
  const { data: settings, isLoading } = useShowSettings(selectedShowId || null);

  if (!selectedShowId) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Settings className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">Select a show to configure its settings.</p>
        </div>
      </div>
    );
  }

  const presetName = settings?.visibility.preset as VisibilityPreset | undefined;
  const presetLabel = presetName ? PRESET_INFO[presetName]?.title : 'Custom';

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Show Settings</h1>
        {selectedShow && <p className="text-muted-foreground">{selectedShow.name}</p>}
      </div>

      {/* Results Visibility Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Results Visibility</CardTitle>
                <CardDescription>
                  {isLoading ? <Skeleton className="h-4 w-32" /> : `Current preset: ${presetLabel}`}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/secretary/results-control')}
            >
              Manage <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Self Check-In Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Self Check-In</CardTitle>
                <CardDescription>
                  {isLoading ? (
                    <Skeleton className="h-4 w-32" />
                  ) : settings?.selfCheckinEnabled ? (
                    'Enabled'
                  ) : (
                    'Disabled'
                  )}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/secretary/results-control')}
            >
              Manage <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent />
      </Card>

      {/* Wait List Settings */}
      {selectedShowId && <WaitListSettingsCard showId={selectedShowId} />}

      {/* myK9Q Access Codes */}
      {selectedShowId && <MyK9QAccessCard showId={selectedShowId} showName={selectedShow?.name} />}
    </div>
  );
}
