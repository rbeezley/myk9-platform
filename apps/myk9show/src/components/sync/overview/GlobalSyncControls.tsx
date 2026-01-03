import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Settings, 
  Zap,
  Shield,
  Clock,
  Database,
  AlertTriangle
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useSyncStore } from '@/store/syncStore';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface GlobalSyncControlsProps {
  className?: string;
}

export const GlobalSyncControls: React.FC<GlobalSyncControlsProps> = ({ className }) => {
  const { user } = useAuth();
  const { 
    syncSettings, 
    updateSyncSettings, 
    pauseAllSync, 
    resumeAllSync, 
    forceFullSync,
    operations
  } = useSyncStore();

  const [isUpdating, setIsUpdating] = useState(false);

  // Check if user has admin privileges
  const isAdmin = user?.role === 'admin';
  const isSecretary = user?.role === 'secretary';
  const hasControlAccess = isAdmin || isSecretary;

  const handleToggleSync = async (enabled: boolean) => {
    setIsUpdating(true);
    try {
      if (enabled) {
        await resumeAllSync();
      } else {
        await pauseAllSync();
      }
      updateSyncSettings({ enabled });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSyncIntervalChange = (interval: string) => {
    updateSyncSettings({ syncInterval: parseInt(interval) });
  };

  const handleForceSync = async () => {
    setIsUpdating(true);
    try {
      await forceFullSync();
    } finally {
      setIsUpdating(false);
    }
  };

  const activeSyncCount = operations.filter(op => op.status === 'syncing').length;

  return (
    <div className={cn("space-y-6", className)}>
      {/* Master Controls */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Master Sync Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Sync Status & Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="sync-enabled" className="text-base font-medium">
                Global Sync Status
              </Label>
              <p className="text-sm text-muted-foreground">
                {syncSettings.enabled ? 'Automatic sync is active' : 'Sync is paused'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge 
                variant={syncSettings.enabled ? 'default' : 'secondary'}
                className="px-3"
              >
                {syncSettings.enabled ? 'Active' : 'Paused'}
              </Badge>
              {hasControlAccess && (
                <Switch
                  id="sync-enabled"
                  checked={(syncSettings as { enabled?: boolean }).enabled || false}
                  onCheckedChange={handleToggleSync}
                  disabled={isUpdating}
                />
              )}
            </div>
          </div>

          <Separator />

          {/* Sync Interval */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">Sync Frequency</Label>
              <p className="text-sm text-muted-foreground">
                How often to check for updates
              </p>
            </div>
            {hasControlAccess ? (
              <Select
                value={syncSettings.syncInterval?.toString() || '30'}
                onValueChange={handleSyncIntervalChange}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 seconds</SelectItem>
                  <SelectItem value="30">30 seconds</SelectItem>
                  <SelectItem value="60">1 minute</SelectItem>
                  <SelectItem value="300">5 minutes</SelectItem>
                  <SelectItem value="600">10 minutes</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline">{syncSettings.syncInterval || 30}s</Badge>
            )}
          </div>

          <Separator />

          {/* Active Operations */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">Active Operations</Label>
              <p className="text-sm text-muted-foreground">
                Currently syncing data
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="px-3">
                {activeSyncCount} running
              </Badge>
              {activeSyncCount > 0 && (
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  <span className="text-xs text-muted-foreground">Syncing</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Controls */}
      {hasControlAccess && (
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Sync Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pause/Resume */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  variant={syncSettings.enabled ? "destructive" : "default"}
                  className="w-full h-auto p-4 flex-col gap-2"
                  onClick={() => handleToggleSync(!syncSettings.enabled)}
                  disabled={isUpdating}
                >
                  {syncSettings.enabled ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                  <div className="text-center">
                    <div className="font-medium">
                      {syncSettings.enabled ? 'Pause Sync' : 'Resume Sync'}
                    </div>
                    <div className="text-xs opacity-80">
                      {syncSettings.enabled ? 'Stop all sync operations' : 'Start sync operations'}
                    </div>
                  </div>
                </Button>
              </motion.div>

              {/* Force Sync */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full h-auto p-4 flex-col gap-2"
                      disabled={isUpdating || !syncSettings.enabled}
                    >
                      <RotateCcw className="h-5 w-5" />
                      <div className="text-center">
                        <div className="font-medium">Force Full Sync</div>
                        <div className="text-xs opacity-80">
                          Sync all data immediately
                        </div>
                      </div>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        Force Full Sync
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will trigger a complete sync of all data across all systems. 
                        This may take several minutes and could impact performance. 
                        Are you sure you want to proceed?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleForceSync}>
                        Force Sync
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </motion.div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Information */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            System Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-muted-foreground">Sync Mode</span>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-500" />
                <span className="font-medium">Secure</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground">Connection</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="font-medium">Online</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground">Auto-sync</span>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                <span className="font-medium">Enabled</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground">User Role</span>
              <Badge variant="outline" className="text-xs">
                {user?.role || 'Unknown'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Access Notice */}
      {!hasControlAccess && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">
                Limited access: Contact an administrator to modify sync settings
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};