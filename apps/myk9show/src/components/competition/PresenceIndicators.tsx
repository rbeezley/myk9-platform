/**
 * Presence Indicators Component
 * Phase 6.2: Live Competition Features
 *
 * Component for displaying user presence information including who's online,
 * their activity status, and analytics about user engagement.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ScrollArea } from '../ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Users,
  Activity,
  Eye,
  Clock,
  Smartphone,
  Monitor,
  Tablet,
  Search,
  TrendingUp,
  User,
  Gavel,
  FileText,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';

import type {
  UserPresence,
  PresenceGroup,
  ActivityIndicator,
  PresenceAnalytics,
} from '../../services/competition/presenceService';
import { formatDistanceToNow } from 'date-fns';

export interface PresenceIndicatorsProps {
  onlineUsers: UserPresence[];
  presenceGroups: PresenceGroup[];
  activityIndicators: ActivityIndicator[];
  analytics: PresenceAnalytics;
  currentUser?: UserPresence | null;
  showFilters?: boolean;
  showAnalytics?: boolean;
  className?: string;
}

const ROLE_CONFIG = {
  judge: {
    label: 'Judge',
    icon: Gavel,
    color: 'bg-red-100 text-red-700 border-red-200',
    priority: 1,
  },
  secretary: {
    label: 'Secretary',
    icon: FileText,
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    priority: 2,
  },
  steward: {
    label: 'Steward',
    icon: UserCheck,
    color: 'bg-teal-100 text-teal-700 border-teal-200',
    priority: 3,
  },
  admin: {
    label: 'Admin',
    icon: ShieldCheck,
    color: 'bg-violet-100 text-violet-700 border-violet-200',
    priority: 4,
  },
  exhibitor: {
    label: 'Exhibitor',
    icon: User,
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    priority: 5,
  },
  observer: {
    label: 'Observer',
    icon: Eye,
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    priority: 6,
  },
};

const STATUS_CONFIG = {
  active: {
    label: 'Active',
    color: 'bg-teal-500',
    textColor: 'text-teal-600',
  },
  idle: {
    label: 'Idle',
    color: 'bg-amber-500',
    textColor: 'text-amber-600',
  },
  away: {
    label: 'Away',
    color: 'bg-orange-500',
    textColor: 'text-orange-600',
  },
  busy: {
    label: 'Busy',
    color: 'bg-red-500',
    textColor: 'text-red-600',
  },
  offline: {
    label: 'Offline',
    color: 'bg-gray-400',
    textColor: 'text-gray-500',
  },
};

const DEVICE_ICONS = {
  desktop: Monitor,
  tablet: Tablet,
  mobile: Smartphone,
};

/**
 * Presence Indicators Component
 */
export function PresenceIndicators({
  onlineUsers,
  presenceGroups,
  activityIndicators,
  analytics,
  showFilters = true,
  showAnalytics = true,
  className = '',
}: PresenceIndicatorsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'role' | 'status' | 'joined'>('role');
  const [selectedTab, setSelectedTab] = useState('users');

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    let users = [...onlineUsers];

    // Apply filters
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      users = users.filter(
        user =>
          user.userName.toLowerCase().includes(term) ||
          user.displayName.toLowerCase().includes(term)
      );
    }

    if (roleFilter !== 'all') {
      users = users.filter(user => user.role === roleFilter);
    }

    if (statusFilter !== 'all') {
      users = users.filter(user => user.status === statusFilter);
    }

    // Sort users
    users.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.displayName.localeCompare(b.displayName);
        case 'role': {
          const roleA = ROLE_CONFIG[a.role]?.priority || 999;
          const roleB = ROLE_CONFIG[b.role]?.priority || 999;
          return roleA - roleB;
        }
        case 'status':
          return a.status.localeCompare(b.status);
        case 'joined':
          return b.joinedAt.getTime() - a.joinedAt.getTime();
        default:
          return 0;
      }
    });

    return users;
  }, [onlineUsers, searchTerm, roleFilter, statusFilter, sortBy]);

  // Get activity indicator for user
  const getUserActivityIndicator = (userId: string) => {
    return activityIndicators.find(
      indicator => indicator.userId === userId && indicator.expiresAt > new Date()
    );
  };

  // Get role configuration
  const getRoleConfig = (role: UserPresence['role']) => {
    return ROLE_CONFIG[role] || ROLE_CONFIG.observer;
  };

  // Get status configuration
  const getStatusConfig = (status: UserPresence['status']) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG.offline;
  };

  // Render user card
  const renderUserCard = (user: UserPresence) => {
    const roleConfig = getRoleConfig(user.role);
    const statusConfig = getStatusConfig(user.status);
    const activityIndicator = getUserActivityIndicator(user.userId);
    const DeviceIcon = DEVICE_ICONS[user.device.type] || Monitor;
    const RoleIcon = roleConfig.icon;

    return (
      <Card key={user.userId} className="relative overflow-hidden">
        <CardContent className="p-4">
          {/* Status indicator */}
          <div className="absolute top-2 right-2">
            <div className={`w-3 h-3 rounded-full ${statusConfig.color}`} />
          </div>

          {/* User info */}
          <div className="space-y-3">
            {/* Avatar and name */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.displayName}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-medium">
                    {user.displayName.substring(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{user.displayName}</p>
                <p className="text-sm text-muted-foreground truncate">{user.userName}</p>
              </div>
            </div>

            {/* Role and device */}
            <div className="flex items-center justify-between">
              <Badge className={`${roleConfig.color} border text-xs`}>
                <RoleIcon className="w-3 h-3 mr-1" />
                {roleConfig.label}
              </Badge>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <DeviceIcon className="w-3 h-3" />
                <span>{user.device.type}</span>
              </div>
            </div>

            {/* Location and activity */}
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Eye className="w-3 h-3" />
                <span className="truncate">
                  {user.location.page}
                  {user.location.section && ` > ${user.location.section}`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                <span className="truncate">{user.activity.description}</span>
              </div>
            </div>

            {/* Activity indicator */}
            {activityIndicator && (
              <div className="flex items-center gap-1 text-xs">
                <div
                  className={`w-2 h-2 rounded-full animate-pulse ${
                    activityIndicator.intensity === 'high'
                      ? 'bg-red-500'
                      : activityIndicator.intensity === 'medium'
                        ? 'bg-amber-500'
                        : 'bg-teal-500'
                  }`}
                />
                <span className="text-muted-foreground">
                  {activityIndicator.type} in {activityIndicator.context}
                </span>
              </div>
            )}

            {/* Last seen */}
            <div className="text-xs text-muted-foreground">
              <Clock className="w-3 h-3 inline mr-1" />
              {user.status === 'active'
                ? 'Now'
                : formatDistanceToNow(user.lastSeen, { addSuffix: true })}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Presence</h2>
          <p className="text-sm text-muted-foreground">
            {analytics.activeUsers} active, {analytics.totalUsers} total users
          </p>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-lg font-bold">{analytics.activeUsers}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{analytics.usersByRole.judge || 0}</div>
            <div className="text-xs text-muted-foreground">Judges</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{analytics.peakConcurrentUsers}</div>
            <div className="text-xs text-muted-foreground">Peak</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users">Users ({filteredUsers.length})</TabsTrigger>
          <TabsTrigger value="groups">Groups ({presenceGroups.length})</TabsTrigger>
          {showAnalytics && <TabsTrigger value="analytics">Analytics</TabsTrigger>}
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          {/* Filters */}
          {showFilters && (
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {Object.entries(ROLE_CONFIG).map(([role, config]) => (
                    <SelectItem key={role} value={role}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                    <SelectItem key={status} value={status}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={value => setSortBy(value as typeof sortBy)}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="role">By Role</SelectItem>
                  <SelectItem value="name">By Name</SelectItem>
                  <SelectItem value="status">By Status</SelectItem>
                  <SelectItem value="joined">By Join Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Users Grid */}
          <ScrollArea className="h-[600px]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredUsers.length > 0 ? (
                filteredUsers.map(renderUserCard)
              ) : (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-4 opacity-50" />
                  <p>No users match the current filters</p>
                  {showFilters && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setSearchTerm('');
                        setRoleFilter('all');
                        setStatusFilter('all');
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Groups Tab */}
        <TabsContent value="groups" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {presenceGroups.length > 0 ? (
              presenceGroups.map(group => (
                <Card key={group.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{group.name}</CardTitle>
                      <Badge variant="outline">{group.userCount}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{group.description}</p>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {group.users.slice(0, 5).map(user => {
                        const roleConfig = getRoleConfig(user.role);
                        const statusConfig = getStatusConfig(user.status);

                        return (
                          <div key={user.userId} className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${statusConfig.color}`} />
                            <span className="text-sm truncate flex-1">{user.displayName}</span>
                            <Badge variant="outline" className="text-xs">
                              {roleConfig.label}
                            </Badge>
                          </div>
                        );
                      })}
                      {group.users.length > 5 && (
                        <p className="text-xs text-muted-foreground text-center">
                          +{group.users.length - 5} more
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-4 opacity-50" />
                <p>No presence groups available</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        {showAnalytics && (
          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* User by Role */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Users by Role</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(analytics.usersByRole).map(([role, count]) => {
                      const config = getRoleConfig(role as UserPresence['role']);
                      const percentage = (count / analytics.totalUsers) * 100;

                      return (
                        <div key={role} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <config.icon className="w-3 h-3" />
                            <span className="text-sm">{config.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium w-8 text-right">{count}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Users by Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Users by Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(analytics.usersByStatus).map(([status, count]) => {
                      const config = getStatusConfig(status as UserPresence['status']);
                      const percentage = (count / analytics.totalUsers) * 100;

                      return (
                        <div key={status} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${config.color}`} />
                            <span className="text-sm">{config.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium w-8 text-right">{count}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Users by Device */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Users by Device</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(analytics.usersByDevice).map(([device, count]) => {
                      const DeviceIcon =
                        DEVICE_ICONS[device as keyof typeof DEVICE_ICONS] || Monitor;
                      const percentage = (count / analytics.totalUsers) * 100;

                      return (
                        <div key={device} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <DeviceIcon className="w-3 h-3" />
                            <span className="text-sm capitalize">{device}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium w-8 text-right">{count}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Activity Summary */}
              <Card className="md:col-span-2 lg:col-span-3">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Activity Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold">{analytics.totalUsers}</div>
                      <div className="text-xs text-muted-foreground">Total Users</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{analytics.activeUsers}</div>
                      <div className="text-xs text-muted-foreground">Active Now</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{analytics.peakConcurrentUsers}</div>
                      <div className="text-xs text-muted-foreground">Peak Concurrent</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">
                        {Math.round(analytics.averageSessionDuration)}
                      </div>
                      <div className="text-xs text-muted-foreground">Avg Session (min)</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default PresenceIndicators;
