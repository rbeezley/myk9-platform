import React, { useState } from 'react';
import { Bell, Mail, Phone, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface NotificationPreferencesCardProps {
  onNotificationToggle?: ((type: string, enabled: boolean) => void) | undefined;
}

export const NotificationPreferencesCard: React.FC<NotificationPreferencesCardProps> = ({
  onNotificationToggle,
}) => {
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [reminderNotifications, setReminderNotifications] = useState(true);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="email-notifications"
              checked={emailNotifications}
              onCheckedChange={checked => {
                setEmailNotifications(checked as boolean);
                onNotificationToggle?.('email', checked as boolean);
              }}
            />
            <Label htmlFor="email-notifications" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email updates about this registration
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="sms-notifications"
              checked={smsNotifications}
              onCheckedChange={checked => {
                setSmsNotifications(checked as boolean);
                onNotificationToggle?.('sms', checked as boolean);
              }}
            />
            <Label htmlFor="sms-notifications" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              SMS notifications (show day reminders)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="reminder-notifications"
              checked={reminderNotifications}
              onCheckedChange={checked => {
                setReminderNotifications(checked as boolean);
                onNotificationToggle?.('reminders', checked as boolean);
              }}
            />
            <Label htmlFor="reminder-notifications" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pre-show reminders (24hrs & 2hrs before)
            </Label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
