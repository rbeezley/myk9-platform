import React, { useState } from 'react';
import { Download, Mail } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import {
  getPaymentMethodDisplay,
  getPaymentStatusBadgeColor,
  getPaymentStatusDisplay,
} from './ConfirmationStep.helpers';
import { StatusBadge } from '@/components/status';
import type { ArmbandAssignment } from './ConfirmationStep.types';

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
}) => {
  const { dogs } = useDogStoreCompat();
  const [activeTab, setActiveTab] = useState('summary');
  const [statusNotes, setStatusNotes] = useState('');

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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="status">Status</TabsTrigger>
              <TabsTrigger value="armbands">Armbands</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="space-y-4">
              <div className="space-y-4">
                {/* Registration Overview */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-muted border border-border rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-foreground">{selectedDogs.length}</div>
                    <div className="text-xs text-muted-foreground">Dogs Registered</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-foreground">{classSelectionsCount}</div>
                    <div className="text-xs text-muted-foreground">Total Classes</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-success">${totalFees.toFixed(0)}</div>
                    <div className="text-xs text-success">Total Fees</div>
                  </div>
                </div>

                {/* Status Overview */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Registration ID</Label>
                    <div className="text-sm text-muted-foreground">{registrationNumber}</div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Entry Status</Label>
                    <div className="mt-1">
                      <StatusBadge family="entry" status={entryStatus} variant="outline" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Payment Status</Label>
                    <div className="mt-1">
                      <Badge className={getPaymentStatusBadgeColor(paymentStatus)}>
                        {getPaymentStatusDisplay(paymentStatus)}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Payment Method</Label>
                    <div className="text-sm text-muted-foreground">
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
                  <Button size="sm" variant="outline" onClick={onSendEmail}>
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

            <TabsContent value="armbands" className="space-y-4">
              <div className="text-sm text-muted-foreground mb-4">
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
