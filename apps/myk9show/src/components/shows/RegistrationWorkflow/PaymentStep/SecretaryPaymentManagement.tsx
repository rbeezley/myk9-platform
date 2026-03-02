import React, { useState } from 'react';
import { Check, DollarSign, AlertTriangle, Calendar, Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { PaymentStatus, EntryStatus } from '@/types/show-registration-types';
import type { PaymentMethod } from '@/types/show-registration-types';
import { getPaymentStatusBadgeColor, getEntryStatusBadgeColor } from './utils';
import type { SecretaryPaymentManagementProps } from './types';

/**
 * Secretary-only payment management panel with tabs for:
 * - Payment marking (check/cash)
 * - Entry status management (accept/reject/waitlist)
 * - Fee override
 * - Reconciliation and bulk operations
 */
export const SecretaryPaymentManagement: React.FC<SecretaryPaymentManagementProps> = ({
  paymentStatus,
  entryStatus,
  feeCalculation,
  selectedDogs,
  waiveFees,
  feeOverride,
  onWaiveFeesChange,
  onFeeOverrideChange,
  onPaymentMethodChange,
  onPaymentStatusChange,
  onEntryStatusChange,
}) => {
  const [activeTab, setActiveTab] = useState('payment');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [statusChangeReason, setStatusChangeReason] = useState('');
  const [statusChangeNotes, setStatusChangeNotes] = useState('');
  const [bulkPaymentMode, setBulkPaymentMode] = useState(false);
  const [selectedEntriesForBulk, setSelectedEntriesForBulk] = useState<string[]>([]);

  const handleSecretaryPaymentMarking = (method: PaymentMethod, status: PaymentStatus) => {
    onPaymentMethodChange(method);
    if (onPaymentStatusChange) {
      onPaymentStatusChange(status);
    }
  };

  const handleEntryStatusChange = (newStatus: EntryStatus) => {
    if (onEntryStatusChange) {
      onEntryStatusChange(newStatus, statusChangeReason);
      setStatusChangeReason('');
      setStatusChangeNotes('');
    }
  };

  const handleBulkPaymentUpdate = (status: PaymentStatus) => {
    selectedEntriesForBulk.forEach(() => {
      if (onPaymentStatusChange) {
        onPaymentStatusChange(status);
      }
    });
    setSelectedEntriesForBulk([]);
    setBulkPaymentMode(false);
  };

  return (
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

            {/* Payment Tab */}
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
                    onClick={() =>
                      handleSecretaryPaymentMarking('check', PaymentStatus.PAID_BY_CHECK)
                    }
                    className="justify-start"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Mark as Paid by Check
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      handleSecretaryPaymentMarking('cash', PaymentStatus.PAID_BY_CASH)
                    }
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
                        onChange={e => setPaymentDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="payment-reference">Reference/Check #</Label>
                      <Input
                        id="payment-reference"
                        placeholder="Check number or reference"
                        value={paymentReference}
                        onChange={e => setPaymentReference(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="payment-notes">Payment Notes</Label>
                    <Textarea
                      id="payment-notes"
                      placeholder="Additional payment notes..."
                      value={paymentNotes}
                      onChange={e => setPaymentNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Entry Status Tab */}
            <TabsContent value="entry-status" className="space-y-4">
              <div className="space-y-4">
                <div className="text-sm text-gray-600">
                  Manage entry acceptance status and provide feedback to exhibitors.
                </div>

                {/* Current Entry Status */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium">Current Status:</span>
                  <Badge className={getEntryStatusBadgeColor(entryStatus)}>{entryStatus}</Badge>
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
                        <SelectItem value="eligibility">
                          Eligibility requirements not met
                        </SelectItem>
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
                      onChange={e => setStatusChangeNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Fee Override Tab */}
            <TabsContent value="fees" className="space-y-4">
              <div className="text-sm text-gray-600">
                Override total fees for special circumstances.
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="waive-fees"
                  checked={waiveFees}
                  onCheckedChange={checked => onWaiveFeesChange(checked === true)}
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
                    onChange={e =>
                      onFeeOverrideChange(e.target.value ? parseFloat(e.target.value) : null)
                    }
                    placeholder={`$${feeCalculation.total.toFixed(2)}`}
                  />
                </div>
              )}
            </TabsContent>

            {/* Reconciliation Tab */}
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
                    onCheckedChange={checked => setBulkPaymentMode(checked === true)}
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
  );
};
