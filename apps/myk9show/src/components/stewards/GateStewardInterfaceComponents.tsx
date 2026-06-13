/**
 * Sub-components extracted from GateStewardInterface.
 *
 * - GateStatsCards: The four stat cards at the top
 * - GateEntryRow: A single entry row in the entries list
 * - GateEmptyState: Empty state when no entries match filters
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, CheckCircle2, AlertTriangle, Eye } from 'lucide-react';
import {
  CheckInStatusIndicator,
  CheckInQuickActions,
} from '@/components/common/CheckInStatusIndicator';
import type { CheckInStatus } from '@myk9/core';
import { cn } from '@/lib/utils';
import type { GateEntry, GateStats } from './GateStewardInterface.types';
import { formatRingLabel } from '@/utils/ringLabel';

/* ---------- Stats Cards ---------- */

interface GateStatsCardsProps {
  stats: GateStats;
}

export const GateStatsCards: React.FC<GateStatsCardsProps> = ({ stats }) => (
  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
    <Card className={stats.needsAttention > 0 ? 'border-orange-200 bg-orange-50/50' : ''}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Needs Attention</CardTitle>
        <AlertTriangle className="h-4 w-4 text-orange-500" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{stats.needsAttention}</div>
        <p className="text-xs text-muted-foreground">Action required</p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">At Gate</CardTitle>
        <Eye className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{stats.atGate}</div>
        <p className="text-xs text-muted-foreground">Ready to run</p>
      </CardContent>
    </Card>

    <Card className={stats.conflicts > 0 ? 'border-red-200 bg-red-50/50' : ''}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Conflicts</CardTitle>
        <AlertTriangle className="h-4 w-4 text-red-500" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{stats.conflicts}</div>
        <p className="text-xs text-muted-foreground">Ring conflicts</p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Ready</CardTitle>
        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{stats.ready}</div>
        <p className="text-xs text-muted-foreground">Checked in</p>
      </CardContent>
    </Card>
  </div>
);

/* ---------- Entry Row ---------- */

interface GateEntryRowProps {
  entry: GateEntry;
  onStatusClick: (entry: GateEntry) => void;
  onQuickStatusUpdate: (entry: GateEntry, status: CheckInStatus) => void;
}

export const GateEntryRow: React.FC<GateEntryRowProps> = ({
  entry,
  onStatusClick,
  onQuickStatusUpdate,
}) => {
  const ringLabel = formatRingLabel(entry.ring);

  return (
    <div
      className={cn(
        'border-b last:border-b-0 p-4 hover:bg-muted/50 transition-colors',
        entry.isUrgent && 'bg-warning/10 border-orange-200',
        entry.checkInStatus === 'conflict' && 'bg-destructive/10 border-red-200'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              #{entry.armband}
            </Badge>
            {ringLabel && <Badge variant="secondary">{ringLabel}</Badge>}
            {entry.isUrgent && (
              <Badge variant="destructive" className="animate-pulse">
                URGENT
              </Badge>
            )}
          </div>

          <div>
            <div className="font-medium">{entry.dogName}</div>
            <div className="text-sm text-muted-foreground">
              {entry.handlerName} &bull; {entry.className}
            </div>
            <div className="text-xs text-muted-foreground">
              Judge: {entry.judgeAssigned}
              {entry.estimatedRunTime && (
                <span> &bull; Est. {entry.estimatedRunTime.toLocaleTimeString()}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onStatusClick(entry)}
            className="hover:scale-105 transition-transform"
          >
            <CheckInStatusIndicator
              status={entry.checkInStatus}
              size="md"
              showLabel={true}
              showTooltip={true}
            />
          </button>

          <CheckInQuickActions
            currentStatus={entry.checkInStatus}
            onUpdateStatus={status => onQuickStatusUpdate(entry, status)}
          />
        </div>
      </div>
    </div>
  );
};

/* ---------- Empty State ---------- */

export const GateEmptyState: React.FC = () => (
  <div className="text-center py-8 text-muted-foreground">
    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
    <p>No entries match the current filters</p>
  </div>
);
