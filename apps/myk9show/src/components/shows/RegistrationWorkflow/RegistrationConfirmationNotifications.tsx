/**
 * Registration Confirmation Notifications Component
 * 
 * Enhanced confirmation system for dog show registrations including:
 * - Email confirmation generation
 * - SMS notification options
 * - Reminder scheduling
 * - Document generation and download
 * - Status update notifications
 */

import React, { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';

// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
// Removed unused Select and Textarea imports
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Icons
import { 
import { logger } from '@/services/LoggingService';
  Mail, 
  Phone, 
  Calendar, 
  FileText, 
  Download,
  Send,
  CheckCircle,
  Clock,
  AlertTriangle,
  Bell
} from 'lucide-react';

// Types
import type { ClassSelectionData, EntryStatus } from '@/types/show-registration-types';
import { PaymentStatus } from '@/types/show-registration-types';

export interface NotificationPreferences {
  email: {
    enabled: boolean;
    address: string;
    confirmRegistration: boolean;
    paymentConfirmation: boolean;
    showReminders: boolean;
    statusUpdates: boolean;
  };
  sms: {
    enabled: boolean;
    number: string;
    showReminders: boolean;
    urgentUpdates: boolean;
  };
  reminders: {
    dayBefore: boolean;
    weekBefore: boolean;
    showDay: boolean;
    customReminders: Array<{
      days: number;
      message: string;
    }>;
  };
}

export interface RegistrationConfirmationData {
  registrationId: string;
  showName: string;
  showDate: string;
  location: string;
  selectedDogs: string[];
  classSelections: ClassSelectionData[];
  totalFees: number;
  paymentStatus: PaymentStatus;
  entryStatus: EntryStatus;
  armbandNumbers?: Record<string, string>;
  confirmationCode: string;
}

export interface RegistrationConfirmationNotificationsProps {
  registrationData: RegistrationConfirmationData;
  currentPreferences?: Partial<NotificationPreferences>;
  onPreferencesChange: (preferences: NotificationPreferences) => void;
  onSendConfirmation: (type: 'email' | 'sms') => Promise<void>;
  onDownloadDocuments: (type: 'confirmation' | 'receipt' | 'summary') => void;
  onScheduleReminders: () => Promise<void>;
  className?: string;
}

/**
 * Comprehensive confirmation and notification management for registrations
 */
export function RegistrationConfirmationNotifications({
  registrationData,
  currentPreferences,
  onPreferencesChange,
  onSendConfirmation,
  onDownloadDocuments,
  onScheduleReminders,
  className
}: RegistrationConfirmationNotificationsProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    email: {
      enabled: true,
      address: '',
      confirmRegistration: true,
      paymentConfirmation: true,
      showReminders: true,
      statusUpdates: true
    },
    sms: {
      enabled: false,
      number: '',
      showReminders: true,
      urgentUpdates: true
    },
    reminders: {
      dayBefore: true,
      weekBefore: true,
      showDay: true,
      customReminders: []
    },
    ...currentPreferences
  });

  const [isSending, setIsSending] = useState(false);
  const [sentNotifications, setSentNotifications] = useState<Set<string>>(new Set());

  // Update parent when preferences change
  const updatePreferences = useCallback((updates: Partial<NotificationPreferences>) => {
    const newPreferences = { ...preferences, ...updates };
    setPreferences(newPreferences);
    onPreferencesChange(newPreferences);
  }, [preferences, onPreferencesChange]);

  // Handle email preference changes
  const updateEmailPreferences = useCallback((updates: Partial<NotificationPreferences['email']>) => {
    updatePreferences({
      email: { ...preferences.email, ...updates }
    });
  }, [preferences.email, updatePreferences]);

  // Handle SMS preference changes
  const updateSmsPreferences = useCallback((updates: Partial<NotificationPreferences['sms']>) => {
    updatePreferences({
      sms: { ...preferences.sms, ...updates }
    });
  }, [preferences.sms, updatePreferences]);

  // Handle reminder preference changes
  const updateReminderPreferences = useCallback((updates: Partial<NotificationPreferences['reminders']>) => {
    updatePreferences({
      reminders: { ...preferences.reminders, ...updates }
    });
  }, [preferences.reminders, updatePreferences]);

  // Send confirmation notifications
  const handleSendConfirmation = useCallback(async (type: 'email' | 'sms') => {
    setIsSending(true);
    try {
      await onSendConfirmation(type);
      setSentNotifications(prev => new Set([...prev, type]));
    } catch (error) {
      logger.error(`Failed to send ${type} confirmation:`, 'shows', {}, error as Error);
    } finally {
      setIsSending(false);
    }
  }, [onSendConfirmation]);

  // Generate confirmation summary
  const confirmationSummary = useMemo(() => {
    const totalDogs = registrationData.selectedDogs.length;
    const totalClasses = registrationData.classSelections.reduce((sum, sel) => sum + sel.selectedClasses.length, 0);
    
    return {
      totalDogs,
      totalClasses,
      totalFees: registrationData.totalFees,
      estimatedShowTime: `${totalClasses * 15} minutes`, // Rough estimate
      nextSteps: [
        'Check email for confirmation receipt',
        'Print armband numbers if assigned',
        'Arrive 30 minutes before first class',
        'Bring vaccination records if required'
      ]
    };
  }, [registrationData]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Registration Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Registration Confirmed
          </CardTitle>
          <CardDescription>
            Confirmation Code: <Badge variant="outline">{registrationData.confirmationCode}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-primary">{confirmationSummary.totalDogs}</div>
              <div className="text-sm text-muted-foreground">Dogs Entered</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary">{confirmationSummary.totalClasses}</div>
              <div className="text-sm text-muted-foreground">Total Classes</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary">${confirmationSummary.totalFees}</div>
              <div className="text-sm text-muted-foreground">Total Fees</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary">
                {registrationData.paymentStatus === PaymentStatus.PAID_ONLINE || 
                 registrationData.paymentStatus === PaymentStatus.PAID_BY_CHECK || 
                 registrationData.paymentStatus === PaymentStatus.PAID_BY_CASH ? '✓' : '⧖'}
              </div>
              <div className="text-sm text-muted-foreground">Payment Status</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDownloadDocuments('confirmation')}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download Confirmation
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDownloadDocuments('receipt')}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Download Receipt
            </Button>
            {registrationData.armbandNumbers && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDownloadDocuments('summary')}
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                Show Summary
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Tabs defaultValue="email" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email
          </TabsTrigger>
          <TabsTrigger value="sms" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            SMS
          </TabsTrigger>
          <TabsTrigger value="reminders" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Reminders
          </TabsTrigger>
        </TabsList>

        {/* Email Notifications */}
        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Notifications
              </CardTitle>
              <CardDescription>
                Configure email notifications for this registration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="email-enabled"
                  checked={preferences.email.enabled}
                  onCheckedChange={(checked) => 
                    updateEmailPreferences({ enabled: !!checked })
                  }
                />
                <Label htmlFor="email-enabled">Enable email notifications</Label>
              </div>

              {preferences.email.enabled && (
                <div className="space-y-4 ml-6">
                  <div className="space-y-2">
                    <Label htmlFor="email-address">Email Address</Label>
                    <Input
                      id="email-address"
                      type="email"
                      value={preferences.email.address}
                      onChange={(e) => updateEmailPreferences({ address: e.target.value })}
                      placeholder="your@email.com"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>Notification Types</Label>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="email-confirmation"
                        checked={preferences.email.confirmRegistration}
                        onCheckedChange={(checked) => 
                          updateEmailPreferences({ confirmRegistration: !!checked })
                        }
                      />
                      <Label htmlFor="email-confirmation">Registration confirmation</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="email-payment"
                        checked={preferences.email.paymentConfirmation}
                        onCheckedChange={(checked) => 
                          updateEmailPreferences({ paymentConfirmation: !!checked })
                        }
                      />
                      <Label htmlFor="email-payment">Payment confirmation</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="email-reminders"
                        checked={preferences.email.showReminders}
                        onCheckedChange={(checked) => 
                          updateEmailPreferences({ showReminders: !!checked })
                        }
                      />
                      <Label htmlFor="email-reminders">Show reminders</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="email-updates"
                        checked={preferences.email.statusUpdates}
                        onCheckedChange={(checked) => 
                          updateEmailPreferences({ statusUpdates: !!checked })
                        }
                      />
                      <Label htmlFor="email-updates">Status updates</Label>
                    </div>
                  </div>

                  <div className="pt-4">
                    <Button
                      onClick={() => handleSendConfirmation('email')}
                      disabled={isSending || !preferences.email.address}
                      className="flex items-center gap-2"
                    >
                      {isSending ? (
                        <Clock className="h-4 w-4 animate-spin" />
                      ) : sentNotifications.has('email') ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      {sentNotifications.has('email') ? 'Email Sent' : 'Send Confirmation Email'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SMS Notifications */}
        <TabsContent value="sms">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                SMS Notifications
              </CardTitle>
              <CardDescription>
                Configure SMS notifications for urgent updates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sms-enabled"
                  checked={preferences.sms.enabled}
                  onCheckedChange={(checked) => 
                    updateSmsPreferences({ enabled: !!checked })
                  }
                />
                <Label htmlFor="sms-enabled">Enable SMS notifications</Label>
              </div>

              {preferences.sms.enabled && (
                <div className="space-y-4 ml-6">
                  <div className="space-y-2">
                    <Label htmlFor="sms-number">Phone Number</Label>
                    <Input
                      id="sms-number"
                      type="tel"
                      value={preferences.sms.number}
                      onChange={(e) => updateSmsPreferences({ number: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>SMS Notification Types</Label>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="sms-reminders"
                        checked={preferences.sms.showReminders}
                        onCheckedChange={(checked) => 
                          updateSmsPreferences({ showReminders: !!checked })
                        }
                      />
                      <Label htmlFor="sms-reminders">Show day reminders</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="sms-urgent"
                        checked={preferences.sms.urgentUpdates}
                        onCheckedChange={(checked) => 
                          updateSmsPreferences({ urgentUpdates: !!checked })
                        }
                      />
                      <Label htmlFor="sms-urgent">Urgent updates only</Label>
                    </div>
                  </div>

                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      SMS notifications are limited to essential updates to minimize costs.
                      Use email for detailed confirmations and reminders.
                    </AlertDescription>
                  </Alert>

                  <div className="pt-4">
                    <Button
                      onClick={() => handleSendConfirmation('sms')}
                      disabled={isSending || !preferences.sms.number}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      {isSending ? (
                        <Clock className="h-4 w-4 animate-spin" />
                      ) : sentNotifications.has('sms') ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      {sentNotifications.has('sms') ? 'SMS Sent' : 'Send SMS Confirmation'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reminder Settings */}
        <TabsContent value="reminders">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Show Reminders
              </CardTitle>
              <CardDescription>
                Schedule automatic reminders for your show
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label>Reminder Schedule</Label>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="remind-week"
                    checked={preferences.reminders.weekBefore}
                    onCheckedChange={(checked) => 
                      updateReminderPreferences({ weekBefore: !!checked })
                    }
                  />
                  <Label htmlFor="remind-week">1 week before show</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="remind-day"
                    checked={preferences.reminders.dayBefore}
                    onCheckedChange={(checked) => 
                      updateReminderPreferences({ dayBefore: !!checked })
                    }
                  />
                  <Label htmlFor="remind-day">1 day before show</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="remind-show-day"
                    checked={preferences.reminders.showDay}
                    onCheckedChange={(checked) => 
                      updateReminderPreferences({ showDay: !!checked })
                    }
                  />
                  <Label htmlFor="remind-show-day">Show day morning (6 AM)</Label>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Reminder Content Preview</Label>
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <strong>Show Reminder: {registrationData.showName}</strong>
                  <br />
                  Date: {registrationData.showDate}
                  <br />
                  Location: {registrationData.location}
                  <br />
                  Dogs: {registrationData.selectedDogs.length}
                  <br />
                  Classes: {confirmationSummary.totalClasses}
                </div>
              </div>

              <div className="pt-4">
                <Button
                  onClick={onScheduleReminders}
                  className="flex items-center gap-2"
                >
                  <Calendar className="h-4 w-4" />
                  Schedule Reminders
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Next Steps */}
      <Card>
        <CardHeader>
          <CardTitle>Next Steps</CardTitle>
          <CardDescription>
            What to do before show day
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            {confirmationSummary.nextSteps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

export default RegistrationConfirmationNotifications;