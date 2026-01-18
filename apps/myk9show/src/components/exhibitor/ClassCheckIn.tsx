import React, { useState, startTransition } from 'react';
import { format } from 'date-fns';
import { logger } from '@/services/LoggingService';
import {
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  User, 
  MessageSquare,
  ArrowLeft,
  Info,
  QrCode,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  ExhibitorClassInfo, 
  CheckInRequest
} from '@/types/exhibitor-types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface ClassCheckInProps {
  classInfo?: ExhibitorClassInfo;
  availableHandlers?: { id: string; name: string; }[];
  onCheckIn?: (request: CheckInRequest) => Promise<void>;
  onBack?: () => void;
}

// Mock class info for when not provided via props
const createMockClassInfo = (): ExhibitorClassInfo => ({
  class: {
    id: 'class-1',
    showId: 'show-1',
    trialId: 'trial-1',
    name: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    maxEntries: 30,
    judgeName: 'Ellen Heavner',
    startTime: new Date(Date.now() + 30 * 60000).toISOString(),
    ringNumber: 1
  },
  trial: {
    id: 'trial-1',
    showId: 'show-1',
    name: 'Scent Work Day 1',
    date: new Date().toISOString(),
    startTime: '08:00',
    endTime: '17:00',
    location: 'Main Building',
    organization: 'AKC'
  },
  entry: {
    id: 'entry-1',
    classId: 'class-1',
    dogId: 'dog-1',
    handlerId: 'handler-001',
    armband: '160',
    runningOrder: 3,
    checkInStatus: 'pending',
    dogCallName: 'Storm',
    dogRegistrationNumber: 'HP12345678',
    breed: 'Border Collie',
    handlerName: 'Sarah Johnson',
    className: 'Container Novice A',
    ringNumber: 1,
    judgeName: 'Ellen Heavner',
    scheduledTime: new Date(Date.now() + 30 * 60000),
    handler: {
      id: 'handler-001',
      name: 'Sarah Johnson',
      email: 'sarah@example.com',
      phone: '555-0123',
      role: 'exhibitor'
    },
    dog: {
      id: 'dog-1',
      name: 'Stormwind\'s Thunder Strike',
      breed: 'Border Collie', // Required field
      sex: 'male', // Required field
      callName: 'Storm',
      age: 5,
      ownerId: 'handler-001',
      description: 'Championship Border Collie',
      dateOfBirth: '2019-03-15',
      gender: 'Male',
      registrations: [{
        id: 'reg-1',
        organization: 'AKC',
        registeredName: 'Stormwind\'s Thunder Strike',
        breed: 'Border Collie',
        registrationNumber: 'AKC123456',
        status: 'Active'
      }]
    }
  },
  ringStatus: {
    classId: 'class-1',
    className: 'Container Novice A',
    ringNumber: 1,
    judgeName: 'Ellen Heavner',
    judgeStatus: 'active',
    totalEntries: 24,
    completedEntries: 1,
    lastUpdated: new Date(),
    onDeck: []
  }
});

export const ClassCheckIn: React.FC<ClassCheckInProps> = ({
  classInfo: propClassInfo,
  availableHandlers = [],
  onCheckIn,
  onBack
}) => {
  const navigate = useNavigate();
  const classInfo = propClassInfo || createMockClassInfo();
  const { class: showClass, entry } = classInfo;
  const [checkInStatus, setCheckInStatus] = useState<'present' | 'scratch' | null>(null);
  const [handlerChange, setHandlerChange] = useState<string>('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showScratchWarning, setShowScratchWarning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOnline] = useState(navigator.onLine);

  // Check if check-in is allowed based on time
  const checkInAllowed = () => {
    const classTime = new Date(showClass.startTime);
    const now = new Date();
    const hoursUntilClass = (classTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    // Allow check-in up to 2 hours before class
    return hoursUntilClass <= 2 && hoursUntilClass > -0.5;
  };

  // Calculate any late fees
  const calculateLateFee = () => {
    const classTime = new Date(showClass.startTime);
    const now = new Date();
    const minutesUntilClass = (classTime.getTime() - now.getTime()) / (1000 * 60);
    
    // Late check-in fee if within 30 minutes of class start
    return minutesUntilClass < 30 && minutesUntilClass > 0 ? 10 : 0;
  };

  const handleCheckInSelect = (status: 'present' | 'scratch') => {
    setCheckInStatus(status);
    if (status === 'scratch') {
      setShowScratchWarning(true);
    } else {
      setShowConfirmDialog(true);
    }
  };

  const handleConfirmCheckIn = async () => {
    if (!checkInStatus) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const request: CheckInRequest = {
        entryId: entry.id,
        status: checkInStatus,
        ...(handlerChange && { handlerChange }),
        ...(specialRequests && { specialRequests }),
        timestamp: new Date()
      };

      if (onCheckIn) {
        await onCheckIn(request);
      } else {
        // Default behavior: log the request
        logger.debug('Check-in request:', 'exhibitor', { data: request });
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      }
      
      // Show success message
      setShowConfirmDialog(false);
      
      // Navigate back after short delay
      setTimeout(() => {
        if (onBack) {
          onBack();
        } else {
          startTransition(() => {
            navigate(-1);
          });
        }
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check in');
      setIsSubmitting(false);
    }
  };

  const getStatusIcon = () => {
    switch (entry.checkInStatus) {
      case 'checked-in':
        return <CheckCircle2 className="h-6 w-6 text-green-600" />;
      case 'scratched':
        return <XCircle className="h-6 w-6 text-red-600" />;
      case 'absent':
        return <AlertTriangle className="h-6 w-6 text-red-600" />;
      default:
        return <Clock className="h-6 w-6 text-gray-400" />;
    }
  };

  const isAlreadyCheckedIn = entry.checkInStatus === 'checked-in' || 
                             entry.checkInStatus === 'scratched' ||
                             entry.checkInStatus === 'completed';

  const lateFee = calculateLateFee();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-40">
        <div className="px-4 py-3 flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack || (() => startTransition(() => navigate(-1)))}
            className="mr-3"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Check In</h1>
            <p className="text-sm text-gray-600">{showClass.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                <Wifi className="h-3 w-3 mr-1" />
                Online
              </Badge>
            ) : (
              <Badge variant="outline" className="text-orange-600 border-orange-600 text-xs">
                <WifiOff className="h-3 w-3 mr-1" />
                Offline
              </Badge>
            )}
            {getStatusIcon()}
          </div>
        </div>
      </div>

      {/* Class Information */}
      <div className="px-4 py-4">
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold">{showClass.name}</h2>
                  <p className="text-gray-600">Ring {showClass.ringNumber}</p>
                </div>
                <Badge variant="outline" className="text-lg px-3 py-1">
                  #{entry.armband}
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Start Time</p>
                  <p className="font-medium">{format(new Date(showClass.startTime), 'h:mm a')}</p>
                </div>
                <div>
                  <p className="text-gray-500">Judge</p>
                  <p className="font-medium">{showClass.judgeName}</p>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-gray-500 text-sm">Dog</p>
                <p className="font-medium">{entry.dog?.callName || entry.dogCallName}</p>
                <p className="text-sm text-gray-600">{entry.dog?.registrations?.[0]?.breed || entry.breed}</p>
              </div>

              <div className="border-t pt-3">
                <p className="text-gray-500 text-sm">Handler</p>
                <p className="font-medium">{entry.handler?.name || entry.handlerName}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Offline Mode Notice */}
      {!isOnline && (
        <div className="px-4">
          <Alert className="bg-blue-50 border-blue-200">
            <QrCode className="h-4 w-4 text-blue-600" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium text-blue-900">Offline Mode Active</p>
                <p className="text-blue-700 text-sm">
                  Your check-in will be saved locally and synced when connection is restored. 
                  Gate stewards have access to advanced offline check-in tools with QR scanning.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Check-in Status */}
      {isAlreadyCheckedIn ? (
        <div className="px-4">
          <Alert className={entry.checkInStatus === 'checked-in' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
            <AlertDescription>
              <div className="flex items-center gap-2">
                {entry.checkInStatus === 'checked-in' ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="font-medium">You are checked in for this class</span>
                  </>
                ) : entry.checkInStatus === 'scratched' ? (
                  <>
                    <XCircle className="h-5 w-5 text-red-600" />
                    <span className="font-medium">You have scratched from this class</span>
                  </>
                ) : (
                  <>
                    <Info className="h-5 w-5 text-blue-600" />
                    <span className="font-medium">This class has been completed</span>
                  </>
                )}
              </div>
            </AlertDescription>
          </Alert>
        </div>
      ) : !checkInAllowed() ? (
        <div className="px-4">
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              Check-in opens 2 hours before your class start time.
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <>
          {/* Check-in Options */}
          <div className="px-4 py-4 space-y-4">
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Check In Status</h3>
              
              <div className="grid grid-cols-2 gap-3">
                <Button
                  size="lg"
                  variant={checkInStatus === 'present' ? 'default' : 'outline'}
                  className="h-24 flex flex-col gap-2"
                  onClick={() => handleCheckInSelect('present')}
                  disabled={isSubmitting}
                >
                  <CheckCircle2 className="h-8 w-8" />
                  <span>Present</span>
                </Button>
                
                <Button
                  size="lg"
                  variant={checkInStatus === 'scratch' ? 'destructive' : 'outline'}
                  className="h-24 flex flex-col gap-2"
                  onClick={() => handleCheckInSelect('scratch')}
                  disabled={isSubmitting}
                >
                  <XCircle className="h-8 w-8" />
                  <span>Scratch</span>
                </Button>
              </div>
            </div>

            {/* Handler Change Option */}
            {availableHandlers.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="handler-change" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Handler Change (Optional)
                </Label>
                <Select value={handlerChange} onValueChange={setHandlerChange}>
                  <SelectTrigger id="handler-change">
                    <SelectValue placeholder="Select alternate handler" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No change</SelectItem>
                    {availableHandlers.map(handler => (
                      <SelectItem key={handler.id} value={handler.id}>
                        {handler.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Special Requests */}
            <div className="space-y-2">
              <Label htmlFor="special-requests" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Special Requests (Optional)
              </Label>
              <Textarea
                id="special-requests"
                placeholder="Any special requests or notes for the judge..."
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                rows={3}
              />
            </div>

            {/* Late Fee Warning */}
            {lateFee > 0 && (
              <Alert className="bg-yellow-50 border-yellow-200">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription>
                  Late check-in fee of ${lateFee} applies (within 30 minutes of class start)
                </AlertDescription>
              </Alert>
            )}

            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Check-In</DialogTitle>
            <DialogDescription>
              Please confirm your check-in details for {showClass.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Dog:</span>
              <span className="font-medium">{entry.dog?.callName || entry.dogCallName} #{entry.armband}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Handler:</span>
              <span className="font-medium">
                {handlerChange ? 
                  availableHandlers.find(h => h.id === handlerChange)?.name : 
                  entry.handler?.name || entry.handlerName}
              </span>
            </div>
            {specialRequests && (
              <div>
                <p className="text-gray-600 mb-1">Special Requests:</p>
                <p className="text-sm bg-gray-50 p-2 rounded">{specialRequests}</p>
              </div>
            )}
            {lateFee > 0 && (
              <div className="flex justify-between text-yellow-600">
                <span>Late Check-in Fee:</span>
                <span className="font-medium">${lateFee}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowConfirmDialog(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmCheckIn}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Checking In...' : 'Confirm Check-In'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scratch Warning Dialog */}
      <Dialog open={showScratchWarning} onOpenChange={setShowScratchWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Scratch</DialogTitle>
            <DialogDescription>
              Are you sure you want to scratch from {showClass.name}?
            </DialogDescription>
          </DialogHeader>
          
          <Alert className="bg-red-50 border-red-200">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription>
              <p className="font-medium mb-1">Important:</p>
              <ul className="text-sm space-y-1">
                <li>• Entry fees are non-refundable</li>
                <li>• You cannot un-scratch once confirmed</li>
                <li>• This may affect title progression</li>
              </ul>
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowScratchWarning(false);
                setCheckInStatus(null);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                setShowScratchWarning(false);
                setShowConfirmDialog(true);
              }}
              disabled={isSubmitting}
            >
              Confirm Scratch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClassCheckIn;