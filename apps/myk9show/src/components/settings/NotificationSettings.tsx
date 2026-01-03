/**
 * Notification Settings Component
 * Allows users to manage their push notification preferences and permissions
 */

import React, { useState } from 'react';
import { Bell, BellOff, Smartphone, Mail, AlertTriangle, TestTube } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { NOTIFICATION_TEMPLATES } from '@/services/notifications/NotificationTemplates';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface NotificationSettingsProps {
  userId: string;
  className?: string;
}

export function NotificationSettings({ userId, className }: NotificationSettingsProps) {
  const {
    isSupported,
    permission,
    isInitialized,
    fcmToken,
    tokenLoading,
    preferences,
    preferencesLoading,
    error,
    actions
  } = useNotifications(userId);

  const [testLoading, setTestLoading] = useState(false);
  const [selectedTestTemplate, setSelectedTestTemplate] = useState('SHOW_REMINDER');

  // Handle enabling notifications
  const handleEnableNotifications = async () => {
    try {
      const success = await actions.requestPermission();
      if (success) {
        // Create default preferences if they don't exist
        if (!preferences) {
          await actions.updatePreferences({
            userId,
            enabled: true,
            types: {
              showReminders: true,
              entryDeadlines: true,
              resultUpdates: true,
              scheduleChanges: true,
              judgeAssignments: true,
              emergencyAlerts: true,
              paymentReminders: true,
              entryConfirmations: true,
            },
            timing: {
              showReminderHours: [24, 48],
              entryDeadlineHours: [24, 48],
              quietHours: {
                enabled: false,
                startTime: '22:00',
                endTime: '08:00',
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
              }
            },
            delivery: {
              browser: true,
              email: false,
              sms: false
            },
            topics: [],
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    } catch (error) {
      console.error('Failed to enable notifications:', error);
    }
  };

  // Handle preference updates
  const handlePreferenceUpdate = async (updates: Record<string, unknown>) => {
    try {
      await actions.updatePreferences(updates);
    } catch (error) {
      console.error('Failed to update preferences:', error);
    }
  };

  // Send test notification
  const handleTestNotification = async () => {
    try {
      setTestLoading(true);
      await actions.testNotification(selectedTestTemplate as keyof typeof NOTIFICATION_TEMPLATES, {
        showName: 'Westminster Dog Show',
        location: 'Madison Square Garden',
        hoursUntil: 24
      });
    } catch (error) {
      console.error('Failed to send test notification:', error);
    } finally {
      setTestLoading(false);
    }
  };

  // Render permission request section
  const renderPermissionSection = () => {
    if (!isSupported) {
      return (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Push notifications are not supported in your browser. Please use a modern browser like Chrome, Firefox, or Safari.
          </AlertDescription>
        </Alert>
      );
    }

    if (permission === 'denied') {
      return (
        <Alert>
          <BellOff className="h-4 w-4" />
          <AlertDescription>
            Notifications are blocked. Please enable them in your browser settings and refresh the page.
          </AlertDescription>
        </Alert>
      );
    }

    if (permission !== 'granted') {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Enable Push Notifications
            </CardTitle>
            <CardDescription>
              Get notified about important show updates, entry deadlines, and results even when you're not using the app.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleEnableNotifications}
              disabled={tokenLoading}
              className="w-full"
            >
              {tokenLoading ? 'Requesting Permission...' : 'Enable Notifications'}
            </Button>
          </CardContent>
        </Card>
      );
    }

    return null;
  };

  // Render notification type preferences
  const renderNotificationTypes = () => {
    if (!preferences) return null;

    const templates = Object.values(NOTIFICATION_TEMPLATES);

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Notification Types</h3>
        <div className="space-y-3">
          {templates.map((template) => {
            const key = template.key.toLowerCase().replace('_', '') as keyof typeof preferences.types;
            const isEnabled = preferences.types[key as keyof typeof preferences.types] ?? template.defaultEnabled;

            return (
              <div key={template.key} className="flex items-center justify-between space-x-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={template.key} className="font-medium">
                      {template.name}
                    </Label>
                    <Badge variant={template.priority === 'critical' ? 'destructive' : 
                                   template.priority === 'high' ? 'default' : 'secondary'}>
                      {template.priority}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {template.description}
                  </p>
                </div>
                <Switch
                  id={template.key}
                  checked={isEnabled}
                  onCheckedChange={(checked) => {
                    handlePreferenceUpdate({
                      types: {
                        ...preferences.types,
                        [key]: checked
                      }
                    });
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render timing preferences
  const renderTimingPreferences = () => {
    if (!preferences) return null;

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Timing Preferences</h3>
        
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Show Reminders</Label>
            <p className="text-sm text-muted-foreground mb-2">
              When to send reminders before shows start
            </p>
            <div className="flex gap-2">
              {[24, 48, 72].map((hours) => (
                <Button
                  key={hours}
                  variant={preferences.timing.showReminderHours.includes(hours) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    const current = preferences.timing.showReminderHours;
                    const updated = current.includes(hours)
                      ? current.filter(h => h !== hours)
                      : [...current, hours].sort((a, b) => a - b);
                    
                    handlePreferenceUpdate({
                      timing: {
                        ...preferences.timing,
                        showReminderHours: updated
                      }
                    });
                  }}
                >
                  {hours}h before
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">Entry Deadline Warnings</Label>
            <p className="text-sm text-muted-foreground mb-2">
              When to warn about approaching entry deadlines
            </p>
            <div className="flex gap-2">
              {[24, 48].map((hours) => (
                <Button
                  key={hours}
                  variant={preferences.timing.entryDeadlineHours.includes(hours) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    const current = preferences.timing.entryDeadlineHours;
                    const updated = current.includes(hours)
                      ? current.filter(h => h !== hours)
                      : [...current, hours].sort((a, b) => a - b);
                    
                    handlePreferenceUpdate({
                      timing: {
                        ...preferences.timing,
                        entryDeadlineHours: updated
                      }
                    });
                  }}
                >
                  {hours}h before
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Quiet Hours</Label>
                <p className="text-sm text-muted-foreground">
                  Disable notifications during these hours
                </p>
              </div>
              <Switch
                checked={preferences.timing.quietHours.enabled}
                onCheckedChange={(enabled) => {
                  handlePreferenceUpdate({
                    timing: {
                      ...preferences.timing,
                      quietHours: {
                        ...preferences.timing.quietHours,
                        enabled
                      }
                    }
                  });
                }}
              />
            </div>
            
            {preferences.timing.quietHours.enabled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Start Time</Label>
                  <Input
                    type="time"
                    value={preferences.timing.quietHours.startTime}
                    onChange={(e) => {
                      handlePreferenceUpdate({
                        timing: {
                          ...preferences.timing,
                          quietHours: {
                            ...preferences.timing.quietHours,
                            startTime: e.target.value
                          }
                        }
                      });
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">End Time</Label>
                  <Input
                    type="time"
                    value={preferences.timing.quietHours.endTime}
                    onChange={(e) => {
                      handlePreferenceUpdate({
                        timing: {
                          ...preferences.timing,
                          quietHours: {
                            ...preferences.timing.quietHours,
                            endTime: e.target.value
                          }
                        }
                      });
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render delivery preferences
  const renderDeliveryPreferences = () => {
    if (!preferences) return null;

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Delivery Methods</h3>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              <div>
                <Label className="font-medium">Browser Push Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive notifications directly in your browser
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.delivery.browser}
              onCheckedChange={(browser) => {
                handlePreferenceUpdate({
                  delivery: {
                    ...preferences.delivery,
                    browser
                  }
                });
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              <div>
                <Label className="font-medium">Email Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Backup delivery via email (coming soon)
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.delivery.email}
              disabled
              onCheckedChange={(email) => {
                handlePreferenceUpdate({
                  delivery: {
                    ...preferences.delivery,
                    email
                  }
                });
              }}
            />
          </div>
        </div>
      </div>
    );
  };

  // Render test section
  const renderTestSection = () => {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Test Notifications</h3>
        
        <div className="space-y-3">
          <div>
            <Label>Notification Template</Label>
            <Select value={selectedTestTemplate} onValueChange={setSelectedTestTemplate}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(NOTIFICATION_TEMPLATES).map((template) => (
                  <SelectItem key={template.key} value={template.key}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Button
            onClick={handleTestNotification}
            disabled={testLoading || permission !== 'granted'}
            className="w-full"
          >
            <TestTube className="h-4 w-4 mr-2" />
            {testLoading ? 'Sending...' : 'Send Test Notification'}
          </Button>
        </div>
      </div>
    );
  };

  if (!isInitialized && !error) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Initializing notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Notification Settings</h2>
        <p className="text-muted-foreground">
          Manage your push notification preferences and stay updated on important show information.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error}
            <Button variant="outline" size="sm" className="ml-2" onClick={actions.clearError}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {renderPermissionSection()}

      {permission === 'granted' && (
        <>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-green-600 border-green-600">
              <Bell className="h-3 w-3 mr-1" />
              Notifications Enabled
            </Badge>
            {fcmToken && (
              <Badge variant="secondary">
                Token: {fcmToken.slice(0, 8)}...
              </Badge>
            )}
          </div>

          <Tabs defaultValue="types" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="types">Types</TabsTrigger>
              <TabsTrigger value="timing">Timing</TabsTrigger>
              <TabsTrigger value="delivery">Delivery</TabsTrigger>
              <TabsTrigger value="test">Test</TabsTrigger>
            </TabsList>
            
            <TabsContent value="types" className="space-y-4">
              <Card>
                <CardContent className="pt-6">
                  {renderNotificationTypes()}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="timing" className="space-y-4">
              <Card>
                <CardContent className="pt-6">
                  {renderTimingPreferences()}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="delivery" className="space-y-4">
              <Card>
                <CardContent className="pt-6">
                  {renderDeliveryPreferences()}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="test" className="space-y-4">
              <Card>
                <CardContent className="pt-6">
                  {renderTestSection()}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {preferencesLoading && (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">Updating preferences...</p>
        </div>
      )}
    </div>
  );
}