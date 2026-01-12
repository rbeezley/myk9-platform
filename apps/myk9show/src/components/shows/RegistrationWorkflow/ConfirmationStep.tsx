import React, { useState } from 'react';
import { CheckCircle, Download, Mail, Calendar, MapPin, Dog, CreditCard, FileText, Hash, User, Clock, AlertCircle, CheckSquare, XCircle, Clock4, Info, Bell, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ClassSelectionData, EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { useDogStore } from '@/store/dogStore';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import { logger } from '@/services/LoggingService';

interface ConfirmationStepProps {
  registrationNumber?: string;
  selectedDogs: string[];
  classSelections: ClassSelectionData[];
  documents: File[];
  paymentMethod: string;
  paymentStatus?: PaymentStatus;
  entryStatus?: EntryStatus;
  totalFees: number;
  showId: string;
  armbandAssignments?: { dogId: string; armband: string; ring?: string }[];
  handlers?: { dogId: string; handlerName: string; isOwner: boolean }[];
  onDownloadReceipt?: () => void;
  onSendEmail?: () => void;
  onStatusChange?: (dogId: string, status: EntryStatus) => void;
  onArmbandAssign?: (dogId: string, armband: string) => void;
  onNotificationToggle?: (type: string, enabled: boolean) => void;
}

export const ConfirmationStep: React.FC<ConfirmationStepProps> = ({
  registrationNumber = 'REG-123456',
  selectedDogs,
  classSelections,
  documents,
  paymentMethod,
  paymentStatus = PaymentStatus.PENDING,
  entryStatus = EntryStatus.PENDING,
  totalFees,
  showId,
  armbandAssignments = [],
  handlers = [],
  onDownloadReceipt,
  onSendEmail,
  onStatusChange,
  onArmbandAssign,
  onNotificationToggle
}) => {
  const { dogs } = useDogStore();
  const { shows = [] } = useShowStore();
  const { trials = [] } = useTrialStore();
  const { classes = [] } = useClassStoreCompat();
  
  const [activeTab, setActiveTab] = useState('summary');
  const [statusNotes, setStatusNotes] = useState('');
  
  // Enhanced notification preferences
  const [notificationPreferences, setNotificationPreferences] = useState({
    email: true,
    sms: false,
    statusChanges: true,
    paymentReceipts: true,
    remindersBefore: 3, // Days before show
    ringCallReminders: true,
    scheduleChanges: true
  });
  
  // Individual notification states for the separate UI section
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [reminderNotifications, setReminderNotifications] = useState(true);
  
  
  const show = shows.find(s => s.id === showId);

  const getPaymentMethodDisplay = () => {
    switch (paymentMethod) {
      case 'credit_card':
        return 'Credit Card';
      case 'check':
        return 'Check (Pay at Show)';
      case 'cash':
        return 'Cash (Pay at Show)';
      case 'secretary_paid':
        return 'Secretary Payment';
      case 'group_payment':
        return 'Group Payment';
      case 'waived':
        return 'Fees Waived';
      default:
        return 'Unknown';
    }
  };

  const getStatusBadgeVariant = (status: EntryStatus) => {
    switch (status) {
      case EntryStatus.ACCEPTED:
        return 'default';
      case EntryStatus.PENDING:
        return 'secondary';
      case EntryStatus.REJECTED:
        return 'destructive';
      case EntryStatus.WAITLIST:
        return 'outline';
      case EntryStatus.MISSING_INFO:
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const getStatusIcon = (status: EntryStatus) => {
    switch (status) {
      case EntryStatus.ACCEPTED:
        return <CheckSquare className="h-4 w-4" />;
      case EntryStatus.PENDING:
        return <Clock4 className="h-4 w-4" />;
      case EntryStatus.REJECTED:
        return <XCircle className="h-4 w-4" />;
      case EntryStatus.WAITLIST:
        return <Clock className="h-4 w-4" />;
      case EntryStatus.MISSING_INFO:
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock4 className="h-4 w-4" />;
    }
  };

  // Enhanced notification management
  const handleNotificationToggle = (type: keyof typeof notificationPreferences, value: boolean | number) => {
    setNotificationPreferences(prev => ({
      ...prev,
      [type]: value
    }));
    
    if (onNotificationToggle) {
      onNotificationToggle(type, value as boolean);
    }
  };



  const handleSendConfirmationEmail = async () => {
    if (onSendEmail) {
      onSendEmail();
    }
    
    // Enhanced email with preferences
    logger.debug('Sending confirmation email with preferences:', 'shows', { data: notificationPreferences });
  };

  const getEntryStatusBadgeColor = (status: EntryStatus) => {
    switch (status) {
      case EntryStatus.ACCEPTED:
        return 'bg-green-100 text-green-800 border-green-200';
      case EntryStatus.REJECTED:
        return 'bg-red-100 text-red-800 border-red-200';
      case EntryStatus.WAITLIST:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case EntryStatus.MISSING_INFO:
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPaymentStatusBadgeColor = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.PAID_ONLINE:
      case PaymentStatus.PAID_BY_CHECK:
      case PaymentStatus.PAID_BY_CASH:
        return 'bg-green-100 text-green-800 border-green-200';
      case PaymentStatus.REFUNDED:
      case PaymentStatus.PARTIAL_REFUND:
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getArmbandForDog = (dogId: string) => {
    return armbandAssignments.find(a => a.dogId === dogId);
  };

  const getHandlerForDog = (dogId: string) => {
    return handlers.find(h => h.dogId === dogId);
  };

  const getDogDetails = (dogId: string) => {
    const dog = dogs.find(d => d.id === dogId);
    const selection = classSelections.find(s => s.dogId === dogId);
    
    if (!dog || !selection) return null;

    const dogClasses = selection.selectedClasses.map(sc => {
      const classData = classes.find((c: { id: string; className?: string; classNumber?: string }) => c.id === sc.classId);
      const trial = trials.find(t => t.id === selection.trialId);
      
      return {
        className: classData?.className || 'Unknown Class',
        classNumber: classData?.classNumber || '',
        trialName: trial?.name || 'Unknown Trial',
        jumpHeight: sc.jumpHeight
      };
    });

    return {
      dog,
      classes: dogClasses
    };
  };

  return (
    <div className="space-y-6">
      {/* Success Message */}
      <div className="text-center py-6">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Registration Confirmed!</h2>
        <p className="text-gray-600">
          Your registration has been successfully submitted.
        </p>
        <Badge variant="default" className="mt-3 text-lg py-1 px-4">
          Confirmation #: {registrationNumber}
        </Badge>
      </div>

      {/* Show Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Show Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>
              <h3 className="font-semibold">{show?.name}</h3>
              <p className="text-sm text-gray-600">{show?.clubName}</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span>{show && formatDateMMDDYYYY(show.startDate)}</span>
              {show?.endDate && show.endDate !== show.startDate && (
                <span>- {formatDateMMDDYYYY(show.endDate)}</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-gray-400" />
              <span>{show?.location}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Registered Dogs and Classes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Dog className="h-4 w-4" />
            Registered Dogs & Classes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {selectedDogs.map(dogId => {
              const details = getDogDetails(dogId);
              const armband = getArmbandForDog(dogId);
              const handler = getHandlerForDog(dogId);
              if (!details) return null;
              
              return (
                <div key={dogId} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-medium text-lg">
                        {details.dog.callName || details.dog.name}
                        {details.dog.registrations?.[0]?.registeredName && ` "${details.dog.registrations[0].registeredName}"`}
                      </h4>
                      <p className="text-sm text-gray-600">
                        {details.dog.registrations?.[0]?.breed || 'No breed specified'} • {details.dog.gender} • {details.dog.dateOfBirth && `Born ${formatDateMMDDYYYY(details.dog.dateOfBirth)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getStatusBadgeVariant(entryStatus)} className="flex items-center gap-1">
                        {getStatusIcon(entryStatus)}
                        {entryStatus}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Classes */}
                    <div>
                      <h5 className="font-medium text-sm mb-2">Classes:</h5>
                      <div className="space-y-1">
                        {details.classes.map((cls, idx) => (
                          <div key={idx} className="text-sm bg-gray-50 rounded p-2">
                            <div className="font-medium">{cls.className} (#{cls.classNumber})</div>
                            <div className="text-gray-600">{cls.trialName}</div>
                            {cls.jumpHeight && <div className="text-xs text-gray-500">Jump Height: {cls.jumpHeight}"</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Additional Details */}
                    <div className="space-y-3">
                      {/* Armband */}
                      <div>
                        <h6 className="font-medium text-sm flex items-center gap-1 mb-1">
                          <Hash className="h-3 w-3" />
                          Armband
                        </h6>
                        {armband ? (
                          <div className="text-sm bg-blue-50 rounded p-2">
                            <div className="font-semibold text-blue-900">#{armband.armband}</div>
                            {armband.ring && <div className="text-blue-700 text-xs">Ring {armband.ring}</div>}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500 italic">
                            Will be assigned closer to show date
                          </div>
                        )}
                      </div>
                      
                      {/* Handler */}
                      <div>
                        <h6 className="font-medium text-sm flex items-center gap-1 mb-1">
                          <User className="h-3 w-3" />
                          Handler
                        </h6>
                        {handler ? (
                          <div className="text-sm bg-green-50 rounded p-2">
                            <div className="font-medium text-green-900">{handler.handlerName}</div>
                            <div className="text-green-700 text-xs">
                              {handler.isOwner ? 'Owner handling' : 'Professional handler'}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500 italic">
                            Owner handling (default)
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Payment Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Payment Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Total Fees:</span>
              <span className="font-semibold">${totalFees.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Payment Method:</span>
              <span>{getPaymentMethodDisplay()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Payment Status:</span>
              <Badge 
                variant={paymentStatus === PaymentStatus.PAID_ONLINE || paymentStatus === PaymentStatus.PAID_BY_CHECK || paymentStatus === PaymentStatus.PAID_BY_CASH ? 'default' : 'secondary'}
                className={paymentStatus === PaymentStatus.PAID_ONLINE || paymentStatus === PaymentStatus.PAID_BY_CHECK || paymentStatus === PaymentStatus.PAID_BY_CASH ? 'text-green-600 border-green-600' : ''}
              >
                {paymentStatus}
              </Badge>
            </div>
            {(paymentStatus === PaymentStatus.PENDING || paymentStatus === PaymentStatus.REFUNDED) && paymentMethod !== 'credit_card' && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {paymentStatus === PaymentStatus.PENDING && 'Payment is due at the show.'}
                  {paymentStatus === PaymentStatus.REFUNDED && 'Payment has been refunded.'}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Secretary Management Tools */}
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
                      <div className="text-2xl font-bold text-gray-900">
                        {classSelections.reduce((total, s) => total + s.selectedClasses.length, 0)}
                      </div>
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
                        <Badge className={getEntryStatusBadgeColor(entryStatus)}>
                          {entryStatus}
                        </Badge>
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
                      <div className="text-sm text-gray-600">{getPaymentMethodDisplay()}</div>
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
                  <Select value={entryStatus} onValueChange={(value) => onStatusChange?.(selectedDogs[0], value as EntryStatus)}>
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
                    onChange={(e) => setStatusNotes(e.target.value)}
                    placeholder="Add notes about status change..."
                    rows={3}
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="notifications" className="space-y-4">
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    Configure how you want to receive updates about your registration and show information.
                  </div>
                  
                  {/* Notification Preferences */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="email-notifications"
                          checked={notificationPreferences.email}
                          onCheckedChange={(checked) => handleNotificationToggle('email', checked === true)}
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
                          onCheckedChange={(checked) => handleNotificationToggle('sms', checked === true)}
                        />
                        <Label htmlFor="sms-notifications" className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          SMS notifications
                        </Label>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    {/* Specific Notification Types */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium">Notification Types</h4>
                      
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="status-changes"
                            checked={notificationPreferences.statusChanges}
                            onCheckedChange={(checked) => handleNotificationToggle('statusChanges', checked === true)}
                          />
                          <Label htmlFor="status-changes" className="text-sm">Entry status changes</Label>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="payment-receipts"
                            checked={notificationPreferences.paymentReceipts}
                            onCheckedChange={(checked) => handleNotificationToggle('paymentReceipts', checked === true)}
                          />
                          <Label htmlFor="payment-receipts" className="text-sm">Payment confirmations</Label>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="ring-call-reminders"
                            checked={notificationPreferences.ringCallReminders}
                            onCheckedChange={(checked) => handleNotificationToggle('ringCallReminders', checked === true)}
                          />
                          <Label htmlFor="ring-call-reminders" className="text-sm">Ring call reminders</Label>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="schedule-changes"
                            checked={notificationPreferences.scheduleChanges}
                            onCheckedChange={(checked) => handleNotificationToggle('scheduleChanges', checked === true)}
                          />
                          <Label htmlFor="schedule-changes" className="text-sm">Schedule changes</Label>
                        </div>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    {/* Reminder Timing */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Send reminders</Label>
                      <Select 
                        value={notificationPreferences.remindersBefore.toString()} 
                        onValueChange={(value) => handleNotificationToggle('remindersBefore', parseInt(value))}
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
                    
                    {/* Test Notification */}
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
                        <Label className="text-sm font-medium">
                          {dog?.callName || dog?.name}
                        </Label>
                      </div>
                      <div className="w-24">
                        <Input
                          placeholder="#123"
                          value={armband?.armband || ''}
                          onChange={(e) => onArmbandAssign?.(dogId, e.target.value)}
                        />
                      </div>
                      <div className="w-16">
                        <Input
                          placeholder="Ring"
                          value={armband?.ring || ''}
                          className="text-xs"
                        />
                      </div>
                    </div>
                  );
                })}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </PermissionGuard>

      {/* Notification Preferences */}
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
                onCheckedChange={(checked) => {
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
                onCheckedChange={(checked) => {
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
                onCheckedChange={(checked) => {
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

      {/* Documentation */}
      {documents && documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Uploaded Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {documents.map((doc, idx) => (
                <div key={idx} className="text-sm text-gray-600">
                  • {doc.name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Important Reminders */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Important Reminders:</strong>
          <ul className="mt-2 space-y-1 list-disc list-inside text-sm">
            <li>Please arrive at least 30 minutes before your first class</li>
            <li>Bring your dog's vaccination records and registration papers</li>
            {(paymentStatus === PaymentStatus.PENDING && paymentMethod !== 'credit_card') && (
              <li>Remember to bring your payment ({paymentMethod === 'check' ? 'check' : paymentMethod === 'cash' ? 'exact cash' : 'payment'})</li>
            )}
            <li>Check-in at the show secretary's table upon arrival</li>
            {entryStatus === EntryStatus.WAITLIST && (
              <li className="text-orange-600 font-medium">You are currently on the waitlist - check for updates before the show</li>
            )}
            {entryStatus === EntryStatus.MISSING_INFO && (
              <li className="text-red-600 font-medium">Missing information required - please contact the show secretary</li>
            )}
            {armbandAssignments.length > 0 && (
              <li>Your armband number(s): {armbandAssignments.map(a => `#${a.armband}`).join(', ')}</li>
            )}
          </ul>
        </AlertDescription>
      </Alert>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button 
          variant="default" 
          className="flex-1"
          onClick={onDownloadReceipt}
        >
          <Download className="h-4 w-4 mr-2" />
          Download Receipt
        </Button>
        <Button 
          variant="outline" 
          className="flex-1"
          onClick={onSendEmail}
        >
          <Mail className="h-4 w-4 mr-2" />
          Email Confirmation
        </Button>
      </div>
    </div>
  );
};