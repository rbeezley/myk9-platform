import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Smartphone, Monitor, Tablet, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DataTable,
  DataTableToolbar,
  DataTableSearch,
  DataTableColumnToggle,
  type ColumnDef,
} from '@/components/ui/data-table';
import type { DataTableColumnMeta } from '@/components/ui/data-table';
import type { UserSession, UserMetrics } from './user-activity-types';

const Avatar = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={cn('rounded-full bg-muted flex items-center justify-center', className)}>
    {children}
  </div>
);
const AvatarFallback = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => (
  <span className={cn('text-xs font-medium', className)} data-testid="avatar-fallback">
    {children}
  </span>
);

function LastActivityDisplay({ lastActivity }: { lastActivity: Date }) {
  const [minutesAgo, setMinutesAgo] = useState(() =>
    Math.floor((Date.now() - lastActivity.getTime()) / 60000)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setMinutesAgo(Math.floor((Date.now() - lastActivity.getTime()) / 60000));
    }, 60000);
    return () => clearInterval(interval);
  }, [lastActivity]);

  return <span>{minutesAgo}m ago</span>;
}

function DeviceIcon({ deviceType }: { deviceType: UserSession['deviceType'] }) {
  switch (deviceType) {
    case 'mobile':
      return <Smartphone className="h-4 w-4" />;
    case 'tablet':
      return <Tablet className="h-4 w-4" />;
    case 'desktop':
      return <Monitor className="h-4 w-4" />;
  }
}

const columns: ColumnDef<UserSession, unknown>[] = [
  {
    accessorKey: 'userName',
    header: 'User',
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">
            {row.original.userName
              .split(' ')
              .map(n => n[0])
              .join('')}
          </AvatarFallback>
        </Avatar>
        <span className="font-medium text-sm">{row.original.userName}</span>
      </div>
    ),
  },
  {
    accessorKey: 'userRole',
    header: 'Role',
  },
  {
    accessorKey: 'isOnline',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.isOnline ? 'default' : 'secondary'}>
        {row.original.isOnline ? (
          <span className="flex items-center gap-1">
            <Wifi className="h-3 w-3" /> Online
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <WifiOff className="h-3 w-3" /> Offline
          </span>
        )}
      </Badge>
    ),
  },
  {
    accessorKey: 'deviceType',
    header: 'Device',
    meta: { responsiveHide: 'sm' } satisfies DataTableColumnMeta,
    cell: ({ row }) => (
      <div className="text-muted-foreground">
        <DeviceIcon deviceType={row.original.deviceType} />
      </div>
    ),
  },
  {
    id: 'lastActivity',
    header: 'Last Activity',
    accessorFn: row => row.lastActivity.getTime(),
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        <LastActivityDisplay lastActivity={row.original.lastActivity} />
      </span>
    ),
    sortingFn: (rowA, rowB) =>
      rowA.original.lastActivity.getTime() - rowB.original.lastActivity.getTime(),
  },
];

interface UserActivityUsersTabProps {
  filteredSessions: UserSession[];
  userMetrics: UserMetrics;
}

export function UserActivityUsersTab({ filteredSessions, userMetrics }: UserActivityUsersTabProps) {
  return (
    <div className="space-y-6">
      {/* Users DataTable */}
      <DataTable
        tableId="userActivityUsers"
        columns={columns}
        data={filteredSessions}
        initialSorting={[{ id: 'lastActivity', desc: true }]}
        toolbar={({ table }) => (
          <DataTableToolbar table={table}>
            <DataTableSearch placeholder="Search users..." />
            <DataTableColumnToggle />
          </DataTableToolbar>
        )}
      />

      {/* Engagement Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>User Engagement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Session Duration</span>
                <span>{userMetrics.averageSessionDuration.toFixed(0)}m avg</span>
              </div>
              <Progress value={(userMetrics.averageSessionDuration / 120) * 100} />
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>User Retention</span>
                <span>{userMetrics.userRetention}%</span>
              </div>
              <Progress value={userMetrics.userRetention} />
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Sync Activity</span>
                <span>
                  {(userMetrics.syncOperations / userMetrics.totalSessions).toFixed(1)} per session
                </span>
              </div>
              <Progress
                value={Math.min(100, (userMetrics.syncOperations / userMetrics.totalSessions) * 10)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
