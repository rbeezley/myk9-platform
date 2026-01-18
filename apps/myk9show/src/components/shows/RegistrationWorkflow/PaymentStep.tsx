import React, { useState } from 'react';
import { CreditCard, DollarSign, Check, Tag, Receipt, Users, AlertTriangle, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClassSelectionData, PaymentStatus, EntryStatus } from '@/types/show-registration-types';
import { useDogStore } from '@/store/dogStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useRegistrationPermissions, REGISTRATION_PERMISSIONS } from '@/hooks/useRegistrationPermissions';
import { PermissionGuard } from '@/components/auth/PermissionGuard';

interface PaymentStepProps {
  selectedDogs: string[];
  classSelections: ClassSelectionData[];
  paymentMethod: string;
  paymentStatus?: PaymentStatus | undefined;
  entryStatus?: EntryStatus | undefined;
  onPaymentMethodChange: (method: string) => void;
  onPaymentStatusChange?: ((status: PaymentStatus) => void) | undefined;
  onEntryStatusChange?: ((status: EntryStatus, reason?: string) => void) | undefined;
  showId?: string | undefined; // Optional - passed from RegistrationWorkflow
  registrationId?: string | undefined; // Optional - passed from RegistrationWorkflow
}

export const PaymentStep: React.FC<PaymentStepProps> = ({
  selectedDogs,
  classSelections,
  paymentMethod,
  paymentStatus = PaymentStatus.PENDING,
  entryStatus = EntryStatus.PENDING,
  onPaymentMethodChange,
  onPaymentStatusChange,
  onEntryStatusChange
}) => {
  const { dogs } = useDogStore();
  const { classes = [] } = useClassStoreCompat();
  useRegistrationPermissions();
  
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [feeOverride, setFeeOverride] = useState<number | null>(null);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [waiveFees, setWaiveFees] = useState(false);
  const [activeTab, setActiveTab] = useState('payment');
  
  // Entry status management state
  const [statusChangeReason, setStatusChangeReason] = useState('');
  const [statusChangeNotes, setStatusChangeNotes] = useState('');
  const [bulkPaymentMode, setBulkPaymentMode] = useState(false);
  const [selectedEntriesForBulk, setSelectedEntriesForBulk] = useState<string[]>([]);

  // Calculate fees based on selections
  const calculateTotalFees = () => {
    let subtotal = 0;
    const breakdown: {
      dogId: string;
      dogName: string;
      classes: { className: string; fee: number }[];
      subtotal: number;
    }[] = [];

    selectedDogs.forEach(dogId => {
      const dog = dogs.find(d => d.id === dogId);
      const dogSelections = classSelections.find(s => s.dogId === dogId);
      
      if (dog && dogSelections) {
        const dogClasses = dogSelections.selectedClasses.map(sc => {
          const classData = classes.find((c) => c.id === sc.classId);
          return {
            className: classData?.className || 'Unknown Class',
            fee: classData?.entryFee || 25
          };
        });
        
        const dogSubtotal = dogClasses.reduce((sum, c) => sum + c.fee, 0);
        subtotal += dogSubtotal;
        
        breakdown.push({
          dogId,
          dogName: dog.callName || dog.name,
          classes: dogClasses,
          subtotal: dogSubtotal
        });
      }
    });

    // Calculate discounts
    const discounts: Array<{ type: string; amount: number; description: string }> = [];
    if (selectedDogs.length >= 3) {
      discounts.push({
        type: 'multi-dog',
        amount: subtotal * 0.1,
        description: '10% multi-dog discount (3+ dogs)'
      });
    }

    // Early bird discount (mock)
    const earlyBirdDiscount = subtotal * 0.05;
    discounts.push({
      type: 'early-bird',
      amount: earlyBirdDiscount,
      description: '5% early bird discount'
    });

    const discountTotal = discounts.reduce((sum, d) => sum + d.amount, 0);
    const total = subtotal - discountTotal;

    return {
      subtotal,
      discounts,
      taxes: 0,
      total,
      breakdown
    };
  };

  const feeCalculation = calculateTotalFees();

  const handleCardNumberChange = (value: string) => {
    // Format card number with spaces
    const formatted = value.replace(/\s/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
    setCardNumber(formatted);
  };

  const handleExpiryDateChange = (value: string) => {
    // Format as MM/YY
    const formatted = value.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2');
    setExpiryDate(formatted);
  };

  // Entry status management handlers
  const handleEntryStatusChange = (newStatus: EntryStatus) => {
    if (onEntryStatusChange) {
      onEntryStatusChange(newStatus, statusChangeReason);
      setStatusChangeReason('');
      setStatusChangeNotes('');
    }
  };

  const handleSecretaryPaymentMarking = (method: string, status: PaymentStatus) => {
    onPaymentMethodChange(method);
    if (onPaymentStatusChange) {
      onPaymentStatusChange(status);
    }
  };

  const handleBulkPaymentUpdate = (status: PaymentStatus) => {
    // Implementation for bulk payment updates
    selectedEntriesForBulk.forEach(() => {
      if (onPaymentStatusChange) {
        onPaymentStatusChange(status);
      }
    });
    setSelectedEntriesForBulk([]);
    setBulkPaymentMode(false);
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

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Payment Information</h3>
        <p className="text-sm text-gray-600 mt-1">
          Review your fees and select a payment method.
        </p>
      </div>

      {/* Fee Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registration Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {feeCalculation.breakdown.map((item, index) => (
              <div key={index}>
                <div className="font-medium text-sm">{item.dogName}</div>
                <div className="ml-4 space-y-1">
                  {item.classes.map((cls, idx) => (
                    <div key={idx} className="flex justify-between text-sm text-gray-600">
                      <span>{cls.className}</span>
                      <span>${cls.fee.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            <Separator />
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>${feeCalculation.subtotal.toFixed(2)}</span>
              </div>
              
              {feeCalculation.discounts.map((discount, index) => (
                <div key={index} className="flex justify-between text-sm text-green-600">
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {discount.description}
                  </span>
                  <span>-${discount.amount.toFixed(2)}</span>
                </div>
              ))}
              
              <Separator />
              
              <div className="flex justify-between font-semibold">
                <span>Total Due</span>
                <span className="text-lg">${feeCalculation.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Method Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Method</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup value={paymentMethod} onValueChange={onPaymentMethodChange}>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <RadioGroupItem value="credit_card" id="credit_card" />
                <Label htmlFor="credit_card" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Credit/Debit Card (Online Payment)
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Secure online payment via Stripe</p>
                </Label>
              </div>
              
              {paymentMethod === 'credit_card' && (
                <div className="ml-6 space-y-3">
                  <div>
                    <Label htmlFor="cardholder">Cardholder Name</Label>
                    <Input
                      id="cardholder"
                      value={cardholderName}
                      onChange={(e) => setCardholderName(e.target.value)}
                      placeholder="John Doe"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="cardnumber">Card Number</Label>
                    <Input
                      id="cardnumber"
                      value={cardNumber}
                      onChange={(e) => handleCardNumberChange(e.target.value)}
                      placeholder="1234 5678 9012 3456"
                      maxLength={19}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="expiry">Expiry Date</Label>
                      <Input
                        id="expiry"
                        value={expiryDate}
                        onChange={(e) => handleExpiryDateChange(e.target.value)}
                        placeholder="MM/YY"
                        maxLength={5}
                      />
                    </div>
                    <div>
                      <Label htmlFor="cvv">CVV</Label>
                      <Input
                        id="cvv"
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))}
                        placeholder="123"
                        maxLength={4}
                      />
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex items-start space-x-3">
                <RadioGroupItem value="check" id="check" />
                <Label htmlFor="check" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    Check (pay at show)
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Bring check made payable to hosting club</p>
                </Label>
              </div>
              
              {paymentMethod === 'check' && (
                <div className="ml-6 space-y-3">
                  <Alert>
                    <AlertDescription>
                      Please bring your check made payable to the hosting club on the day of the show.
                    </AlertDescription>
                  </Alert>
                  <div>
                    <Label htmlFor="checknumber">Check Number (optional)</Label>
                    <Input
                      id="checknumber"
                      value={checkNumber}
                      onChange={(e) => setCheckNumber(e.target.value)}
                      placeholder="1234"
                    />
                  </div>
                </div>
              )}
              
              <div className="flex items-start space-x-3">
                <RadioGroupItem value="cash" id="cash" />
                <Label htmlFor="cash" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Cash (pay at show)
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Exact amount required at check-in</p>
                </Label>
              </div>
              
              <PermissionGuard permission={REGISTRATION_PERMISSIONS.MARK_PAYMENT}>
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="secretary_paid" id="secretary_paid" />
                  <Label htmlFor="secretary_paid" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4" />
                      Secretary Payment (Already Received)
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Payment received outside of online system</p>
                  </Label>
                </div>
              </PermissionGuard>
              
              <PermissionGuard permission={REGISTRATION_PERMISSIONS.MARK_PAYMENT}>
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="group_payment" id="group_payment" />
                  <Label htmlFor="group_payment" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Group/Club Payment
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Payment handled by club or group organizer</p>
                  </Label>
                </div>
              </PermissionGuard>
              
              <PermissionGuard permission="registration:override_fees">
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="waived" id="waived" />
                  <Label htmlFor="waived" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Fees Waived
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Administrative waiver of registration fees</p>
                  </Label>
                </div>
              </PermissionGuard>
              
              {paymentMethod === 'cash' && (
                <div className="ml-6">
                  <Alert>
                    <AlertDescription>
                      Please bring exact cash amount on the day of the show.
                    </AlertDescription>
                  </Alert>
                </div>
              )}
              
              {paymentMethod === 'secretary_paid' && (
                <div className="ml-6 space-y-3">
                  <Alert>
                    <AlertDescription>
                      Mark this registration as paid when payment has been received outside the online system.
                    </AlertDescription>
                  </Alert>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="payment-date">Payment Date</Label>
                      <Input
                        id="payment-date"
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="payment-reference">Reference/Receipt #</Label>
                      <Input
                        id="payment-reference"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder="Receipt #123"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="payment-notes">Payment Notes</Label>
                    <Textarea
                      id="payment-notes"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      placeholder="Additional details about payment..."
                      rows={2}
                    />
                  </div>
                </div>
              )}
              
              {paymentMethod === 'group_payment' && (
                <div className="ml-6 space-y-3">
                  <Alert>
                    <AlertDescription>
                      This registration is part of a group payment arrangement.
                    </AlertDescription>
                  </Alert>
                  <div>
                    <Label htmlFor="group-reference">Group/Organization Reference</Label>
                    <Input
                      id="group-reference"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Club payment batch #123"
                    />
                  </div>
                </div>
              )}
              
              {paymentMethod === 'waived' && (
                <div className="ml-6 space-y-3">
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      This will waive all registration fees for this entry. This action requires admin approval.
                    </AlertDescription>
                  </Alert>
                  <div>
                    <Label htmlFor="waiver-reason">Reason for Fee Waiver</Label>
                    <Textarea
                      id="waiver-reason"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      placeholder="Explain the reason for waiving fees..."
                      required
                    />
                  </div>
                </div>
              )}
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Secretary Features */}
      <PermissionGuard permission="registration:override_fees">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Secretary Payment Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="payment">Payment</TabsTrigger>
                <TabsTrigger value="entry-status">Entry Status</TabsTrigger>
                <TabsTrigger value="fees">Fee Override</TabsTrigger>
                <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
              </TabsList>
              
              <TabsContent value="payment" className="space-y-4">
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    Use these options to handle payments received outside the online system.
                  </div>
                  
                  {/* Current Payment Status */}
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium">Current Status:</span>
                    <Badge className={getPaymentStatusBadgeColor(paymentStatus)}>
                      {paymentStatus}
                    </Badge>
                  </div>
                  
                  {/* Quick Payment Actions */}
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      variant="outline" 
                      onClick={() => handleSecretaryPaymentMarking('check', PaymentStatus.PAID_BY_CHECK)}
                      className="justify-start"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Mark as Paid by Check
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => handleSecretaryPaymentMarking('cash', PaymentStatus.PAID_BY_CASH)}
                      className="justify-start"
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      Mark as Paid by Cash
                    </Button>
                  </div>
                  
                  {/* Payment Details Form */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="payment-date">Payment Date</Label>
                        <Input
                          id="payment-date"
                          type="date"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="payment-reference">Reference/Check #</Label>
                        <Input
                          id="payment-reference"
                          placeholder="Check number or reference"
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="payment-notes">Payment Notes</Label>
                      <Textarea
                        id="payment-notes"
                        placeholder="Additional payment notes..."
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="entry-status" className="space-y-4">
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    Manage entry acceptance status and provide feedback to exhibitors.
                  </div>
                  
                  {/* Current Entry Status */}
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium">Current Status:</span>
                    <Badge className={getEntryStatusBadgeColor(entryStatus)}>
                      {entryStatus}
                    </Badge>
                  </div>
                  
                  {/* Entry Status Actions */}
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      variant="outline" 
                      onClick={() => handleEntryStatusChange(EntryStatus.ACCEPTED)}
                      className="justify-start text-green-700 border-green-200 hover:bg-green-50"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Accept Entry
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => handleEntryStatusChange(EntryStatus.WAITLIST)}
                      className="justify-start text-yellow-700 border-yellow-200 hover:bg-yellow-50"
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      Add to Waitlist
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => handleEntryStatusChange(EntryStatus.MISSING_INFO)}
                      className="justify-start text-orange-700 border-orange-200 hover:bg-orange-50"
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Request More Info
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => handleEntryStatusChange(EntryStatus.REJECTED)}
                      className="justify-start text-red-700 border-red-200 hover:bg-red-50"
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Reject Entry
                    </Button>
                  </div>
                  
                  {/* Status Change Details */}
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="status-reason">Reason for Status Change</Label>
                      <Select value={statusChangeReason} onValueChange={setStatusChangeReason}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a reason..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="class-full">Class is full</SelectItem>
                          <SelectItem value="eligibility">Eligibility requirements not met</SelectItem>
                          <SelectItem value="documentation">Missing documentation</SelectItem>
                          <SelectItem value="payment">Payment issues</SelectItem>
                          <SelectItem value="technical">Technical issues</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor="status-notes">Additional Notes</Label>
                      <Textarea
                        id="status-notes"
                        placeholder="Additional notes for the exhibitor..."
                        value={statusChangeNotes}
                        onChange={(e) => setStatusChangeNotes(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="fees" className="space-y-4">
                <div className="text-sm text-gray-600">
                  Override total fees for special circumstances.
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="waive-fees"
                    checked={waiveFees}
                    onCheckedChange={(checked) => setWaiveFees(checked === true)}
                  />
                  <Label htmlFor="waive-fees">Waive all fees</Label>
                </div>
                {!waiveFees && (
                  <div>
                    <Label htmlFor="fee-override">Override Total Amount</Label>
                    <Input
                      id="fee-override"
                      type="number"
                      step="0.01"
                      min="0"
                      value={feeOverride || ''}
                      onChange={(e) => setFeeOverride(e.target.value ? parseFloat(e.target.value) : null)}
                      placeholder={`$${feeCalculation.total.toFixed(2)}`}
                    />
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="reconciliation" className="space-y-4">
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    Bulk payment operations and reconciliation tools.
                  </div>
                  
                  {/* Bulk Payment Mode Toggle */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="bulk-payment-mode"
                      checked={bulkPaymentMode}
                      onCheckedChange={(checked) => setBulkPaymentMode(checked === true)}
                    />
                    <Label htmlFor="bulk-payment-mode">Enable bulk payment operations</Label>
                  </div>
                  
                  {bulkPaymentMode && (
                    <div className="space-y-3 p-4 border border-blue-200 rounded-lg bg-blue-50">
                      <div className="text-sm font-medium text-blue-900">Bulk Payment Actions</div>
                      <div className="grid grid-cols-3 gap-2">
                        <Button 
                          size="sm"
                          variant="outline"
                          onClick={() => handleBulkPaymentUpdate(PaymentStatus.PAID_BY_CHECK)}
                        >
                          Mark All as Check
                        </Button>
                        <Button 
                          size="sm"
                          variant="outline"
                          onClick={() => handleBulkPaymentUpdate(PaymentStatus.PAID_BY_CASH)}
                        >
                          Mark All as Cash
                        </Button>
                        <Button 
                          size="sm"
                          variant="outline"
                          onClick={() => handleBulkPaymentUpdate(PaymentStatus.PENDING)}
                        >
                          Reset to Pending
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {/* Quick Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">{selectedDogs.length}</div>
                      <div className="text-xs text-gray-600">Total Entries</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-700">
                        ${feeCalculation.total.toFixed(0)}
                      </div>
                      <div className="text-xs text-green-600">Total Fees</div>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-700">
                        {paymentStatus === PaymentStatus.PENDING ? '0' : '1'}
                      </div>
                      <div className="text-xs text-blue-600">Paid Entries</div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </PermissionGuard>

      {/* Payment Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Selected Payment Method:</span>
              <Badge variant="outline">
                {paymentMethod === 'credit_card' && 'Credit/Debit Card'}
                {paymentMethod === 'check' && 'Check at Show'}
                {paymentMethod === 'cash' && 'Cash at Show'}
                {paymentMethod === 'secretary_paid' && 'Secretary Payment'}
                {paymentMethod === 'group_payment' && 'Group Payment'}
                {paymentMethod === 'waived' && 'Fees Waived'}
              </Badge>
            </div>
            <div className="flex justify-between font-semibold text-lg">
              <span>Amount Due:</span>
              <span>
                {paymentMethod === 'waived' || waiveFees ? 
                  '$0.00 (Waived)' : 
                  `$${(feeOverride || feeCalculation.total).toFixed(2)}`
                }
              </span>
            </div>
            {paymentMethod === 'credit_card' && (
              <Alert>
                <CreditCard className="h-4 w-4" />
                <AlertDescription>
                  Payment will be processed securely via Stripe when you complete registration.
                </AlertDescription>
              </Alert>
            )}
            {['check', 'cash'].includes(paymentMethod) && (
              <Alert>
                <Calendar className="h-4 w-4" />
                <AlertDescription>
                  Payment must be completed at the show before check-in.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Security Notice */}
      <Alert>
        <CreditCard className="h-4 w-4" />
        <AlertDescription>
          Your payment information is secure and encrypted. We never store your full card details.
        </AlertDescription>
      </Alert>
    </div>
  );
};