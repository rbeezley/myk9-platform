/**
 * Device Manager Component
 * Phase 6.4: User Preferences & UI State
 *
 * Manage connected devices and cross-device synchronization
 */

import { useState } from 'react';
import {
  Monitor,
  Smartphone,
  Tablet,
  Trash2,
  MoreVertical,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Wifi,
  WifiOff,
  RefreshCw,
  Settings,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SyncStatusIndicator, DeviceSyncStatus } from './SyncStatusIndicator';
import type { DeviceInfo, SyncState } from '@/types/user-preferences';

interface DeviceManagerProps {
  devices: DeviceInfo[];
  syncState: SyncState;
  onRemoveDevice?: (deviceId: string) => void;
  onRefresh?: () => void;
}

export function DeviceManager({
  devices,
  syncState,
  onRemoveDevice,
  onRefresh,
}: DeviceManagerProps) {
  const [deviceToRemove, setDeviceToRemove] = useState<DeviceInfo | null>(null);

  /**
   * Get device icon based on type
   */
  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'mobile':
        return Smartphone;
      case 'tablet':
        return Tablet;
      case 'desktop':
      default:
        return Monitor;
    }
  };

  /**
   * Get device status color
   */
  const getDeviceStatus = (device: DeviceInfo) => {
    if (device.isCurrentDevice) {
      return { color: 'text-blue-600', bg: 'bg-blue-50', label: 'Current Device' };
    }

    const isRecent = new Date().getTime() - device.lastSeen.getTime() < 5 * 60 * 1000; // 5 minutes
    if (isRecent) {
      return { color: 'text-green-600', bg: 'bg-green-50', label: 'Online' };
    }

    const isToday = new Date().getTime() - device.lastSeen.getTime() < 24 * 60 * 60 * 1000; // 24 hours
    if (isToday) {
      return { color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Recently Active' };
    }

    return { color: 'text-gray-500', bg: 'bg-gray-50', label: 'Offline' };
  };

  /**
   * Handle device removal
   */
  const handleRemoveDevice = () => {
    if (deviceToRemove && onRemoveDevice) {
      onRemoveDevice(deviceToRemove.id);
      setDeviceToRemove(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sync Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            Sync Status
          </CardTitle>
          <CardDescription>Current synchronization status across all devices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <SyncStatusIndicator syncState={syncState} />

            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Status
              </Button>
            )}
          </div>

          {syncState.status === 'conflict' && (
            <Alert className="mt-4" variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Sync conflicts detected. Your preferences were modified on multiple devices
                simultaneously. Please resolve conflicts to continue syncing.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Connected Devices */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Connected Devices
              </CardTitle>
              <CardDescription>Devices that have accessed your account recently</CardDescription>
            </div>
            <Badge variant="secondary" className="text-xs">
              {devices.length} {devices.length === 1 ? 'device' : 'devices'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {devices.length === 0 ? (
            <div className="text-center py-8">
              <Monitor className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h4 className="text-lg font-medium mb-2">No Devices Found</h4>
              <p className="text-sm text-muted-foreground">
                No devices have been registered yet. Devices are automatically registered when you
                access your preferences.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map(device => {
                const DeviceIcon = getDeviceIcon(device.type);
                const status = getDeviceStatus(device);

                return (
                  <div
                    key={device.id}
                    className="flex items-center space-x-4 p-4 border rounded-lg"
                  >
                    <div
                      className={`
                      w-12 h-12 rounded-lg flex items-center justify-center
                      ${status.bg}
                    `}
                    >
                      <DeviceIcon className={`h-6 w-6 ${status.color}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium truncate">{device.name}</h4>
                        <Badge
                          variant={device.isCurrentDevice ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {status.label}
                        </Badge>
                      </div>

                      <div className="text-sm text-muted-foreground space-y-1">
                        <div className="flex items-center gap-4">
                          <span>{device.platform}</span>
                          <span className="capitalize">{device.type}</span>
                        </div>
                        <DeviceSyncStatus
                          lastSeen={device.lastSeen}
                          isCurrentDevice={device.isCurrentDevice}
                        />
                      </div>
                    </div>

                    {!device.isCurrentDevice && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Device options"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Settings className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeviceToRemove(device)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove Device
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Sync Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              <strong>Automatic Sync:</strong> Your preferences are automatically synchronized
              across all devices in real-time when changes are made.
            </AlertDescription>
          </Alert>

          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              <strong>Conflict Resolution:</strong> If preferences are changed on multiple devices
              simultaneously, you'll be prompted to resolve conflicts.
            </AlertDescription>
          </Alert>

          <Alert>
            <WifiOff className="h-4 w-4" />
            <AlertDescription>
              <strong>Offline Changes:</strong> Changes made while offline will be synchronized
              automatically when connection is restored.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Device Security */}
      <Card>
        <CardHeader>
          <CardTitle>Device Security</CardTitle>
          <CardDescription>
            Best practices for keeping your account secure across devices
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Secure Connections</div>
                <div className="text-muted-foreground">All data is encrypted in transit</div>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Local Storage</div>
                <div className="text-muted-foreground">Preferences cached securely on device</div>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Auto Cleanup</div>
                <div className="text-muted-foreground">
                  Inactive devices are automatically removed
                </div>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Real-time Sync</div>
                <div className="text-muted-foreground">Changes propagate instantly</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Remove Device Dialog */}
      <AlertDialog open={!!deviceToRemove} onOpenChange={() => setDeviceToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Device</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{deviceToRemove?.name}" from your account? This will
              stop syncing preferences to that device, but won't affect your data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveDevice}
              className="bg-destructive text-destructive-foreground"
            >
              Remove Device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
