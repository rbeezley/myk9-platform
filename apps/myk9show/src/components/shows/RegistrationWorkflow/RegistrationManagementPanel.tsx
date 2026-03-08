import React, { useState } from 'react';
import { Download, Mail, Bell, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { logger } from '@/services/LoggingService';
import {
  getPaymentMethodDisplay,
  getEntryStatusBadgeColor,
  getPaymentStatusBadgeColor,
} from './ConfirmationStep.helpers';
import type { ArmbandAssignment, NotificationPreferences } from './ConfirmationStep.types';

interface RegistrationManagementPanelProps {
  registrationNumber: string;
  selectedDogs: string[];
  classSelectionsCount: number;
  totalFees: number;
  entryStatus: EntryStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  armbandAssignments: ArmbandAssignment[];
  onDownloadReceipt?: (() => void) | undefined;
  onSendEmail?: (() => void) | undefined;
  onStatusChange?: ((dogId: string, status: EntryStatus) => void) | undefined;
  onArmbandAssign?: ((dogId: string, armband: string) => void) | undefined;
  onNotificationToggle?: ((type: string, enabled: boolean) => void) | undefined;
}

export const RegistrationManagementPanel: React.FC<RegistrationManagementPanelProps> = ({
  registrationNumber,
  selectedDogs,
  classSelectionsCount,
  totalFees,
  entryStatus,
  paymentStatus,
  paymentMethod,
  armbandAssignments,
  onDownloadReceipt,
  onSendEmail,
  onStatusChange,
  onArmbandAssign,
  onNotificationToggle,
}) => {
  const { dogs } = useDogStoreCompat();
  const [activeTab, setActiveTab] = useState('summary');
  const [statusNotes, setStatusNotes] = useState('');

  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    email: true,
    sms: false,
    statusChanges: true,
    paymentReceipts: true,
    remindersBefore: 3,
    ringCallReminders: true,
    scheduleChanges: true,
  });

  const handleNotificationToggle = (
    type: keyof NotificationPreferences,
    value: boolean | number
  ) => {
    setNotificationPreferences(prev => ({
      ...prev,
      [type]: value,
    }));

    if (onNotificationToggle) {
      onNotificationToggle(type, value as boolean);
    }
  };

  const handleSendConfirmationEmail = () => {
    if (onSendEmail) {
      onSendEmail();
    }
    logger.debug('Sending confirmation email with preferences:', 'shows', {
      data: notificationPreferences,
    });
  };

  const getArmbandForDog = (dogId: string) => {
    return armbandAssignments.find(a => a.dogId === dogId);
  };

  return (
    <PermissionGuard permission="registration:manage_status">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registration Management</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="status">Status</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="armbands">Armbands</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="space-y-4">
              <div className="space-y-4">
                {/* Registration Overview */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{selectedDogs.length}</div>
                    <div className="text-xs text-gray-600">Dogs Registered</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{classSelectionsCount}</div>
                    <div className="text-xs text-gray-600">Total Classes</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-700">${totalFees.toFixed(0)}</div>
                    <div className="text-xs text-green-600">Total Fees</div>
                  </div>
                </div>

                {/* Status Overview */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Registration ID</Label>
                    <div className="text-sm text-gray-600">{registrationNumber}</div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Entry Status</Label>
                    <div className="mt-1">
                      <Badge className={getEntryStatusBadgeColor(entryStatus)}>{entryStatus}</Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Payment Status</Label>
                    <div className="mt-1">
                      <Badge className={getPaymentStatusBadgeColor(paymentStatus)}>
                        {paymentStatus}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Payment Method</Label>
                    <div className="text-sm text-gray-600">
                      {getPaymentMethodDisplay(paymentMethod)}
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={onDownloadReceipt}>
                    <Download className="h-4 w-4 mr-2" />
                    Download Receipt
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleSendConfirmationEmail}>
                    <Mail className="h-4 w-4 mr-2" />
                    Email Confirmation
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="status" className="space-y-4">
              <div>
                <Label htmlFor="status-select">Change Entry Status</Label>
                <Select
                  value={entryStatus}
                  onValueChange={value => onStatusChange?.(selectedDogs[0], value as EntryStatus)}
                >
                  <SelectTrigger id="status-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EntryStatus.PENDING}>Pending Review</SelectItem>
                    <SelectItem value={EntryStatus.ACCEPTED}>Accepted</SelectItem>
                    <SelectItem value={EntryStatus.REJECTED}>Rejected</SelectItem>
                    <SelectItem value={EntryStatus.WAITLIST}>Waitlist</SelectItem>
                    <SelectItem value={EntryStatus.MISSING_INFO}>Missing Information</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="status-notes">Status Notes</Label>
                <Textarea
                  id="status-notes"
                  value={statusNotes}
                  onChange={e => setStatusNotes(e.target.value)}
                  placeholder="Add notes about status change..."
                  rows={3}
                />
              </div>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-4">
              <div className="space-y-4">
                <div className="text-sm text-gray-600">
                  Configure how you want to receive updates about your registration and show
                  information.
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="email-notifications"
                        checked={notificationPreferences.email}
                        onCheckedChange={checked =>
                          handleNotificationToggle('email', checked === true)
                        }
                      />
                      <Label htmlFor="email-notifications" className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Email notifications
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="sms-notifications"
                        checked={notificationPreferences.sms}
                        onCheckedChange={checked =>
                          handleNotificationToggle('sms', checked === true)
                        }
                      />
                      <Label htmlFor="sms-notifications" className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        SMS notifications
                      </Label>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Notification Types</h4>

                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="status-changes"
                          checked={notificationPreferences.statusChanges}
                          onCheckedChange={checked =>
                            handleNotificationToggle('statusChanges', checked === true)
                          }
                        />
                        <Label htmlFor="status-changes" className="text-sm">
                          Entry status changes
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="payment-receipts"
                          checked={notificationPreferences.paymentReceipts}
                          onCheckedChange={checked =>
                            handleNotificationToggle('paymentReceipts', checked === true)
                          }
                        />
                        <Label htmlFor="payment-receipts" className="text-sm">
                          Payment confirmations
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="ring-call-reminders"
                          checked={notificationPreferences.ringCallReminders}
                          onCheckedChange={checked =>
                            handleNotificationToggle('ringCallReminders', checked === true)
                          }
                        />
                        <Label htmlFor="ring-call-reminders" className="text-sm">
                          Ring call reminders
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="schedule-changes"
                          checked={notificationPreferences.scheduleChanges}
                          onCheckedChange={checked =>
                            handleNotificationToggle('scheduleChanges', checked === true)
                          }
                        />
                        <Label htmlFor="schedule-changes" className="text-sm">
                          Schedule changes
                        </Label>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Send reminders</Label>
                    <Select
                      value={notificationPreferences.remindersBefore.toString()}
                      onValueChange={value =>
                        handleNotificationToggle('remindersBefore', parseInt(value))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select reminder timing..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 day before show</SelectItem>
                        <SelectItem value="3">3 days before show</SelectItem>
                        <SelectItem value="7">1 week before show</SelectItem>
                        <SelectItem value="14">2 weeks before show</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="pt-4">
                    <Button size="sm" variant="outline" onClick={handleSendConfirmationEmail}>
                      <Bell className="h-4 w-4 mr-2" />
                      Send Test Notification
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="armbands" className="space-y-4">
              <div className="text-sm text-gray-600 mb-4">
                Assign armband numbers for each dog. Numbers should be unique within each ring.
              </div>
              {selectedDogs.map(dogId => {
                const dog = dogs.find(d => d.id === dogId);
                const armband = getArmbandForDog(dogId);
                return (
                  <div key={dogId} className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label className="text-sm font-medium">{dog?.callName || dog?.name}</Label>
                    </div>
                    <div className="w-24">
                      <Input
                        placeholder="#123"
                        value={armband?.armband || ''}
                        onChange={e => onArmbandAssign?.(dogId, e.target.value)}
                      />
                    </div>
                    <div className="w-16">
                      <Input placeholder="Ring" value={armband?.ring || ''} className="text-xs" />
                    </div>
                  </div>
                );
              })}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </PermissionGuard>
  );
};
