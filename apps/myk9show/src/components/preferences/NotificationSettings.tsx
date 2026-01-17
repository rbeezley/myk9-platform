/**
 * Enhanced Notification Settings Component
 * Phase 6.4: User Preferences & UI State
 * 
 * Comprehensive notification preferences with sound, timing, and delivery options
 */


import { 
  Bell, 
  BellOff, 
  Volume2, 
  VolumeX, 
  Clock, 
  Mail, 
  Smartphone,
  MessageSquare,
  Moon,
  AlertTriangle,
  CheckCircle,
  Calendar,
  CreditCard,
  UserCheck,
  Trophy,
  RotateCcw
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { NotificationPreferences } from '@/types/user-preferences';

interface NotificationSettingsProps {
  preferences?: NotificationPreferences;
  onUpdate: (preferences: Partial<NotificationPreferences>) => void;
  onReset: () => void;
}

// Notification type configurations
const notificationTypes = [
  {
    key: 'showReminders' as keyof NotificationPreferences['types'],
    label: 'Show Reminders',
    description: 'Notifications before competitions start',
    icon: Calendar,
    priority: 'high' as const,
  },
  {
    key: 'entryDeadlines' as keyof NotificationPreferences['types'],
    label: 'Entry Deadlines',
    description: 'Warnings about approaching entry deadlines',
    icon: Clock,
    priority: 'high' as const,
  },
  {
    key: 'resultUpdates' as keyof NotificationPreferences['types'],
    label: 'Result Updates',
    description: 'When competition results are posted',
    icon: Trophy,
    priority: 'medium' as const,
  },
  {
    key: 'scheduleChanges' as keyof NotificationPreferences['types'],
    label: 'Schedule Changes',
    description: 'When competition schedules are modified',
    icon: AlertTriangle,
    priority: 'high' as const,
  },
  {
    key: 'judgeAssignments' as keyof NotificationPreferences['types'],
    label: 'Judge Assignments',
    description: 'When judges are assigned or changed',
    icon: UserCheck,
    priority: 'medium' as const,
  },
  {
    key: 'emergencyAlerts' as keyof NotificationPreferences['types'],
    label: 'Emergency Alerts',
    description: 'Critical updates and emergency notifications',
    icon: AlertTriangle,
    priority: 'critical' as const,
  },
  {
    key: 'paymentReminders' as keyof NotificationPreferences['types'],
    label: 'Payment Reminders',
    description: 'Reminders for unpaid entries and fees',
    icon: CreditCard,
    priority: 'medium' as const,
  },
  {
    key: 'entryConfirmations' as keyof NotificationPreferences['types'],
    label: 'Entry Confirmations',
    description: 'Confirmations when entries are received',
    icon: CheckCircle,
    priority: 'low' as const,
  },
];

const deliveryMethods = [
  {
    key: 'browser' as keyof NotificationPreferences['delivery'],
    label: 'Browser Push',
    description: 'Push notifications in your browser',
    icon: Smartphone,
    available: true,
  },
  {
    key: 'email' as keyof NotificationPreferences['delivery'],
    label: 'Email',
    description: 'Email notifications (coming soon)',
    icon: Mail,
    available: false,
  },
  {
    key: 'sms' as keyof NotificationPreferences['delivery'],
    label: 'SMS',
    description: 'Text message notifications (coming soon)',
    icon: MessageSquare,
    available: false,
  },
];

const reminderHourOptions = [
  { value: 1, label: '1 hour' },
  { value: 6, label: '6 hours' },
  { value: 24, label: '24 hours' },
  { value: 48, label: '48 hours' },
  { value: 72, label: '3 days' },
  { value: 168, label: '1 week' },
];

export function NotificationSettings({ preferences, onUpdate, onReset }: NotificationSettingsProps) {
  
  /**
   * Handle notification type toggle
   */
  const handleTypeToggle = (type: keyof NotificationPreferences['types'], enabled: boolean) => {
    if (!preferences) return;
    
    onUpdate({
      types: {
        ...preferences.types,
        [type]: enabled,
      },
    });
  };

  /**
   * Handle delivery method toggle
   */
  const handleDeliveryToggle = (method: keyof NotificationPreferences['delivery'], enabled: boolean) => {
    if (!preferences) return;
    
    onUpdate({
      delivery: {
        ...preferences.delivery,
        [method]: enabled,
      },
    });
  };

  /**
   * Handle sound settings
   */
  const handleSoundUpdate = (updates: Partial<NotificationPreferences['sound']>) => {
    if (!preferences) return;
    
    onUpdate({
      sound: {
        ...preferences.sound,
        ...updates,
      },
    });
  };

  /**
   * Handle reminder hours toggle
   */
  const handleReminderHoursToggle = (
    type: 'showReminderHours' | 'entryDeadlineHours',
    hours: number,
    enabled: boolean
  ) => {
    if (!preferences) return;
    
    const current = preferences.timing[type] || [];
    const updated = enabled
      ? [...current, hours].sort((a, b) => a - b)
      : current.filter(h => h !== hours);
    
    onUpdate({
      timing: {
        ...preferences.timing,
        [type]: updated,
      },
    });
  };

  /**
   * Handle quiet hours update
   */
  const handleQuietHoursUpdate = (updates: Partial<NotificationPreferences['timing']['quietHours']>) => {
    if (!preferences) return;
    
    onUpdate({
      timing: {
        ...preferences.timing,
        quietHours: {
          ...preferences.timing.quietHours,
          ...updates,
        },
      },
    });
  };

  /**
   * Get priority badge color
   */
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'destructive';
      case 'high': return 'default';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold tracking-tight mb-2">Notification Preferences</h3>
        <p className="text-sm text-muted-foreground">
          Control when and how you receive notifications about competitions and updates
        </p>
      </div>

      {/* Master Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {preferences?.enabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
            Notifications
          </CardTitle>
          <CardDescription>
            Enable or disable all notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-medium">Enable Notifications</Label>
              <div className="text-sm text-muted-foreground">
                Turn on to receive all notification types
              </div>
            </div>
            <Switch
              checked={preferences?.enabled ?? true}
              onCheckedChange={(enabled) => onUpdate({ enabled })}
            />
          </div>
        </CardContent>
      </Card>

      {preferences?.enabled && (
        <>
          {/* Notification Types */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Types
              </CardTitle>
              <CardDescription>
                Choose which types of notifications you want to receive
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {notificationTypes.map((type) => (
                <div key={type.key} className="flex items-center justify-between space-x-2">
                  <div className="flex items-center space-x-3 flex-1">
                    <type.icon className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Label className="font-medium">{type.label}</Label>
                        <Badge variant={getPriorityColor(type.priority) as 'destructive' | 'default' | 'secondary' | 'outline'} className="text-xs">
                          {type.priority}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {type.description}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={preferences?.types[type.key] ?? true}
                    onCheckedChange={(checked) => handleTypeToggle(type.key, checked)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Timing Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Timing Preferences
              </CardTitle>
              <CardDescription>
                Configure when to receive reminders and notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Show Reminders */}
              <div>
                <Label className="font-medium mb-3 block">Show Reminders</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Select when to receive reminders before competitions start
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {reminderHourOptions.map((option) => (
                    <Button
                      key={option.value}
                      variant={
                        preferences?.timing.showReminderHours?.includes(option.value) 
                          ? 'default' 
                          : 'outline'
                      }
                      size="sm"
                      onClick={() => 
                        handleReminderHoursToggle(
                          'showReminderHours',
                          option.value,
                          !preferences?.timing.showReminderHours?.includes(option.value)
                        )
                      }
                      className="justify-center"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Entry Deadline Warnings */}
              <div>
                <Label className="font-medium mb-3 block">Entry Deadline Warnings</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Select when to receive warnings about approaching deadlines
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {reminderHourOptions.filter(o => o.value <= 72).map((option) => (
                    <Button
                      key={option.value}
                      variant={
                        preferences?.timing.entryDeadlineHours?.includes(option.value) 
                          ? 'default' 
                          : 'outline'
                      }
                      size="sm"
                      onClick={() => 
                        handleReminderHoursToggle(
                          'entryDeadlineHours',
                          option.value,
                          !preferences?.timing.entryDeadlineHours?.includes(option.value)
                        )
                      }
                      className="justify-center"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Quiet Hours */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="font-medium flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      Quiet Hours
                    </Label>
                    <div className="text-sm text-muted-foreground">
                      Disable notifications during specific hours
                    </div>
                  </div>
                  <Switch
                    checked={preferences?.timing.quietHours?.enabled ?? false}
                    onCheckedChange={(enabled) => handleQuietHoursUpdate({ enabled })}
                  />
                </div>

                {preferences?.timing.quietHours?.enabled && (
                  <div className="grid grid-cols-2 gap-4 ml-6">
                    <div>
                      <Label className="text-sm">Start Time</Label>
                      <Input
                        type="time"
                        value={preferences.timing.quietHours.startTime || '22:00'}
                        onChange={(e) => handleQuietHoursUpdate({ startTime: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-sm">End Time</Label>
                      <Input
                        type="time"
                        value={preferences.timing.quietHours.endTime || '08:00'}
                        onChange={(e) => handleQuietHoursUpdate({ endTime: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={preferences.timing.quietHours.weekendsOnly ?? false}
                          onCheckedChange={(weekendsOnly) => handleQuietHoursUpdate({ weekendsOnly })}
                          id="weekends-only"
                        />
                        <Label htmlFor="weekends-only" className="text-sm">
                          Apply only on weekends
                        </Label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Delivery Methods */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Delivery Methods
              </CardTitle>
              <CardDescription>
                Choose how you want to receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {deliveryMethods.map((method) => (
                <div key={method.key} className="flex items-center justify-between space-x-2">
                  <div className="flex items-center space-x-3">
                    <method.icon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <Label className="font-medium">{method.label}</Label>
                        {!method.available && (
                          <Badge variant="outline" className="text-xs">Coming Soon</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {method.description}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={preferences?.delivery[method.key] ?? false}
                    onCheckedChange={(checked) => handleDeliveryToggle(method.key, checked)}
                    disabled={!method.available}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Sound Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {preferences?.sound?.enabled ? (
                  <Volume2 className="h-5 w-5" />
                ) : (
                  <VolumeX className="h-5 w-5" />
                )}
                Sound Settings
              </CardTitle>
              <CardDescription>
                Configure notification sounds and volume
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-medium">Enable Sound</Label>
                  <div className="text-sm text-muted-foreground">
                    Play sounds when notifications arrive
                  </div>
                </div>
                <Switch
                  checked={preferences?.sound?.enabled ?? true}
                  onCheckedChange={(enabled) => handleSoundUpdate({ enabled })}
                />
              </div>

              {preferences?.sound?.enabled && (
                <>
                  <Separator />
                  
                  <div className="space-y-4">
                    <div>
                      <Label className="font-medium mb-3 block">Volume</Label>
                      <div className="px-3">
                        <Slider
                          value={[preferences?.sound?.volume ?? 0.7]}
                          onValueChange={([value]) => handleSoundUpdate({ volume: value })}
                          max={1}
                          min={0}
                          step={0.1}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>Quiet</span>
                          <span>{Math.round((preferences?.sound?.volume ?? 0.7) * 100)}%</span>
                          <span>Loud</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="font-medium">Custom Sound</Label>
                        <div className="text-sm text-muted-foreground">
                          Use custom notification sound (coming soon)
                        </div>
                      </div>
                      <Switch
                        checked={preferences?.sound?.useCustomSound ?? false}
                        onCheckedChange={(useCustomSound) => handleSoundUpdate({ useCustomSound })}
                        disabled
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Reset Button */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={onReset} className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset Notification Settings
        </Button>
      </div>
    </div>
  );
}