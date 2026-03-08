import React, { useCallback } from 'react';
import {
  CheckCircle,
  Download,
  Mail,
  Calendar,
  MapPin,
  Dog,
  CreditCard,
  FileText,
  Hash,
  User,
  Clock,
  AlertCircle,
  CheckSquare,
  XCircle,
  Clock4,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ClassSelectionData, EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import { notifications } from '@/lib/notifications';
import {
  getPaymentMethodDisplay,
  getStatusBadgeVariant,
  isPaidStatus,
  generateReceiptText,
  generateReceiptHtml,
  downloadBlob,
} from './ConfirmationStep.helpers';
import type { ReceiptData } from './ConfirmationStep.helpers';
import type { ConfirmationStepProps, DogClassDetails } from './ConfirmationStep.types';
import { RegistrationManagementPanel } from './RegistrationManagementPanel';
import { NotificationPreferencesCard } from './NotificationPreferencesCard';

export type { ConfirmationStepProps } from './ConfirmationStep.types';

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
  onNotificationToggle,
}) => {
  const { dogs } = useDogStoreCompat();
  const { shows = [] } = useShowStore();
  const { trials = [] } = useTrialStore();
  const { classes = [] } = useClassStoreCompat();

  const show = shows.find(s => s.id === showId);

  const buildReceiptData = useCallback((): ReceiptData => {
    const showDate =
      show?.startDate && show?.endDate && show.endDate !== show.startDate
        ? `${formatDateMMDDYYYY(show.startDate)} - ${formatDateMMDDYYYY(show.endDate)}`
        : show?.startDate
          ? formatDateMMDDYYYY(show.startDate)
          : 'TBD';

    const receiptDogs = selectedDogs
      .map(dogId => {
        const dog = dogs.find(d => d.id === dogId);
        const selection = classSelections.find((s: ClassSelectionData) => s.dogId === dogId);
        if (!dog || !selection) return null;

        const trial = trials.find(t => t.id === selection.trialId);
        const dogClasses: DogClassDetails[] = selection.selectedClasses.map(sc => {
          const classData = classes.find(
            (c: { id: string; className?: string | undefined; classNumber?: string | undefined }) =>
              c.id === sc.classId
          );
          return {
            className: classData?.className || 'Unknown Class',
            classNumber: classData?.classNumber || '',
            trialName: trial?.name || 'Unknown Trial',
            jumpHeight: sc.jumpHeight,
          };
        });

        return {
          name: dog.callName || dog.name,
          breed: dog.registrations?.[0]?.breed || 'Unknown breed',
          classes: dogClasses,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    return {
      registrationNumber,
      showName: show?.name || 'Unknown Show',
      showClub: show?.clubName || '',
      showDate,
      showLocation: show?.location || 'TBD',
      dogs: receiptDogs,
      totalFees,
      paymentMethod,
      paymentStatus,
      entryStatus,
      generatedAt: new Date().toLocaleString(),
    };
  }, [
    registrationNumber,
    selectedDogs,
    classSelections,
    dogs,
    classes,
    trials,
    show,
    totalFees,
    paymentMethod,
    paymentStatus,
    entryStatus,
  ]);

  const handleDownloadReceipt = useCallback(() => {
    if (onDownloadReceipt) {
      onDownloadReceipt();
      return;
    }
    const data = buildReceiptData();
    const html = generateReceiptHtml(data);
    const filename = `receipt-${data.registrationNumber}.html`;
    downloadBlob(html, filename, 'text/html');
    notifications.success('Receipt downloaded', {
      description: `Saved as ${filename}`,
    });
  }, [onDownloadReceipt, buildReceiptData]);

  const handleSendEmail = useCallback(async () => {
    if (onSendEmail) {
      onSendEmail();
      return;
    }
    const data = buildReceiptData();
    const text = generateReceiptText(data);
    try {
      await navigator.clipboard.writeText(text);
      notifications.success('Receipt copied to clipboard', {
        description: 'Paste it into your email client to send yourself a copy.',
      });
    } catch {
      // Clipboard API may fail (e.g. insecure context), fall back to info toast
      // TODO: Implement server-side email via Supabase Edge Function
      notifications.info('Email confirmation coming soon', {
        description:
          'Server-side email is not yet available. Use "Download Receipt" to save a copy.',
      });
    }
  }, [onSendEmail, buildReceiptData]);

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

  const getArmbandForDog = (dogId: string) => {
    return armbandAssignments.find(a => a.dogId === dogId);
  };

  const getHandlerForDog = (dogId: string) => {
    return handlers.find(h => h.dogId === dogId);
  };

  const getDogDetails = (dogId: string) => {
    const dog = dogs.find(d => d.id === dogId);
    const selection = classSelections.find((s: ClassSelectionData) => s.dogId === dogId);

    if (!dog || !selection) return null;

    const trial = trials.find(t => t.id === selection.trialId);
    const dogClasses: DogClassDetails[] = selection.selectedClasses.map(sc => {
      const classData = classes.find(
        (c: { id: string; className?: string | undefined; classNumber?: string | undefined }) =>
          c.id === sc.classId
      );
      return {
        className: classData?.className || 'Unknown Class',
        classNumber: classData?.classNumber || '',
        trialName: trial?.name || 'Unknown Trial',
        jumpHeight: sc.jumpHeight,
      };
    });

    return {
      dog,
      classes: dogClasses,
    };
  };

  const classSelectionsCount = classSelections.reduce(
    (total, s) => total + s.selectedClasses.length,
    0
  );

  return (
    <div className="space-y-6">
      {/* Success Message */}
      <div className="text-center py-6">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Registration Confirmed!</h2>
        <p className="text-gray-600">Your registration has been successfully submitted.</p>
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
                        {details.dog.registrations?.[0]?.registeredName &&
                          ` "${details.dog.registrations[0].registeredName}"`}
                      </h4>
                      <p className="text-sm text-gray-600">
                        {details.dog.registrations?.[0]?.breed || 'No breed specified'} &bull;{' '}
                        {details.dog.gender} &bull;{' '}
                        {details.dog.dateOfBirth &&
                          `Born ${formatDateMMDDYYYY(details.dog.dateOfBirth)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={getStatusBadgeVariant(entryStatus)}
                        className="flex items-center gap-1"
                      >
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
                            <div className="font-medium">
                              {cls.className} (#{cls.classNumber})
                            </div>
                            <div className="text-gray-600">{cls.trialName}</div>
                            {cls.jumpHeight && (
                              <div className="text-xs text-gray-500">
                                Jump Height: {cls.jumpHeight}&quot;
                              </div>
                            )}
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
                            {armband.ring && (
                              <div className="text-blue-700 text-xs">Ring {armband.ring}</div>
                            )}
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
              <span>{getPaymentMethodDisplay(paymentMethod)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Payment Status:</span>
              <Badge
                variant={isPaidStatus(paymentStatus) ? 'default' : 'secondary'}
                className={isPaidStatus(paymentStatus) ? 'text-green-600 border-green-600' : ''}
              >
                {paymentStatus}
              </Badge>
            </div>
            {(paymentStatus === PaymentStatus.PENDING ||
              paymentStatus === PaymentStatus.REFUNDED) &&
              paymentMethod !== 'credit_card' && (
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
      <RegistrationManagementPanel
        registrationNumber={registrationNumber}
        selectedDogs={selectedDogs}
        classSelectionsCount={classSelectionsCount}
        totalFees={totalFees}
        entryStatus={entryStatus}
        paymentStatus={paymentStatus}
        paymentMethod={paymentMethod}
        armbandAssignments={armbandAssignments}
        onDownloadReceipt={handleDownloadReceipt}
        onSendEmail={handleSendEmail}
        onStatusChange={onStatusChange}
        onArmbandAssign={onArmbandAssign}
        onNotificationToggle={onNotificationToggle}
      />

      {/* Notification Preferences */}
      <NotificationPreferencesCard onNotificationToggle={onNotificationToggle} />

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
                  &bull; {doc.name}
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
            <li>Bring your dog&apos;s vaccination records and registration papers</li>
            {paymentStatus === PaymentStatus.PENDING && paymentMethod !== 'credit_card' && (
              <li>
                Remember to bring your payment (
                {paymentMethod === 'check'
                  ? 'check'
                  : paymentMethod === 'cash'
                    ? 'exact cash'
                    : 'payment'}
                )
              </li>
            )}
            <li>Check-in at the show secretary&apos;s table upon arrival</li>
            {entryStatus === EntryStatus.WAITLIST && (
              <li className="text-orange-600 font-medium">
                You are currently on the waitlist - check for updates before the show
              </li>
            )}
            {entryStatus === EntryStatus.MISSING_INFO && (
              <li className="text-red-600 font-medium">
                Missing information required - please contact the show secretary
              </li>
            )}
            {armbandAssignments.length > 0 && (
              <li>
                Your armband number(s): {armbandAssignments.map(a => `#${a.armband}`).join(', ')}
              </li>
            )}
          </ul>
        </AlertDescription>
      </Alert>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button variant="default" className="flex-1" onClick={handleDownloadReceipt}>
          <Download className="h-4 w-4 mr-2" />
          Download Receipt
        </Button>
        <Button variant="outline" className="flex-1" onClick={handleSendEmail}>
          <Mail className="h-4 w-4 mr-2" />
          Email Confirmation
        </Button>
      </div>
    </div>
  );
};
