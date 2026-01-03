import React, { useState, useMemo } from 'react';
import { DollarSign, Download, Upload, Search, CheckCircle, AlertCircle, Clock, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PaymentStatus, EntryStatus } from '@/types/show-registration-types';
import { useRegistrationPermissions, REGISTRATION_PERMISSIONS } from '@/hooks/useRegistrationPermissions';
import { PermissionGuard } from '@/components/auth/PermissionGuard';

interface PaymentEntry {
  id: string;
  registrationId: string;
  dogName: string;
  ownerName: string;
  totalFee: number;
  paymentStatus: PaymentStatus;
  entryStatus: EntryStatus;
  paymentMethod?: string;
  paymentReference?: string;
  paymentDate?: string;
  notes?: string;
}

interface PaymentReconciliationProps {
  showId: string;
  entries: PaymentEntry[];
  onPaymentStatusUpdate: (entryId: string, status: PaymentStatus, reference?: string, notes?: string) => void;
  onBulkPaymentUpdate: (entryIds: string[], status: PaymentStatus, reference?: string) => void;
  onExportReport: (entries: PaymentEntry[]) => void;
  onImportPayments: (file: File) => void;
}

export const PaymentReconciliation: React.FC<PaymentReconciliationProps> = ({
  showId,
  entries,
  onPaymentStatusUpdate,
  onBulkPaymentUpdate,
  onExportReport,
  onImportPayments
}) => {
  useRegistrationPermissions();
  
  // Log for debugging purposes
  console.log('PaymentReconciliation for show:', showId, 'with', entries.length, 'entries');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all');
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [bulkPaymentStatus, setBulkPaymentStatus] = useState<PaymentStatus>(PaymentStatus.PAID_BY_CHECK);
  const [bulkReference, setBulkReference] = useState('');
  const [reconciliationNotes, setReconciliationNotes] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  // Filter and search entries
  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      const matchesSearch = !searchTerm || 
        entry.dogName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.ownerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.registrationId.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || entry.paymentStatus === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [entries, searchTerm, statusFilter]);

  // Payment statistics
  const paymentStats = useMemo(() => {
    const totalEntries = entries.length;
    const paidEntries = entries.filter(e => 
      e.paymentStatus === PaymentStatus.PAID_ONLINE ||
      e.paymentStatus === PaymentStatus.PAID_BY_CHECK ||
      e.paymentStatus === PaymentStatus.PAID_BY_CASH
    ).length;
    const pendingEntries = entries.filter(e => e.paymentStatus === PaymentStatus.PENDING).length;
    const totalFees = entries.reduce((sum, e) => sum + e.totalFee, 0);
    const paidFees = entries
      .filter(e => 
        e.paymentStatus === PaymentStatus.PAID_ONLINE ||
        e.paymentStatus === PaymentStatus.PAID_BY_CHECK ||
        e.paymentStatus === PaymentStatus.PAID_BY_CASH
      )
      .reduce((sum, e) => sum + e.totalFee, 0);
    
    return {
      totalEntries,
      paidEntries,
      pendingEntries,
      totalFees,
      paidFees,
      pendingFees: totalFees - paidFees,
      paymentRate: totalEntries > 0 ? (paidEntries / totalEntries) * 100 : 0
    };
  }, [entries]);

  const handleSelectEntry = (entryId: string, selected: boolean) => {
    setSelectedEntries(prev => 
      selected 
        ? [...prev, entryId]
        : prev.filter(id => id !== entryId)
    );
  };

  const handleSelectAll = (selected: boolean) => {
    setSelectedEntries(selected ? filteredEntries.map(e => e.id) : []);
  };

  const handleBulkPaymentUpdate = () => {
    if (selectedEntries.length > 0) {
      onBulkPaymentUpdate(selectedEntries, bulkPaymentStatus, bulkReference);
      setSelectedEntries([]);
      setBulkReference('');
    }
  };

  const handleExportReport = () => {
    onExportReport(filteredEntries);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImportPayments(file);
    }
  };

  const getPaymentStatusIcon = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.PAID_ONLINE:
      case PaymentStatus.PAID_BY_CHECK:
      case PaymentStatus.PAID_BY_CASH:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case PaymentStatus.PENDING:
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case PaymentStatus.REFUNDED:
      case PaymentStatus.PARTIAL_REFUND:
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
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
    <PermissionGuard permission={REGISTRATION_PERMISSIONS.MANAGE_PAYMENTS}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Payment Reconciliation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="entries">Payment Entries</TabsTrigger>
              <TabsTrigger value="bulk">Bulk Operations</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {/* Payment Statistics Dashboard */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-700">{paymentStats.totalEntries}</div>
                  <div className="text-xs text-blue-600">Total Entries</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-700">{paymentStats.paidEntries}</div>
                  <div className="text-xs text-green-600">Paid Entries</div>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-700">{paymentStats.pendingEntries}</div>
                  <div className="text-xs text-yellow-600">Pending Payment</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-700">{paymentStats.paymentRate.toFixed(1)}%</div>
                  <div className="text-xs text-gray-600">Payment Rate</div>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-gray-600">Total Expected Fees</div>
                  <div className="text-xl font-bold">${paymentStats.totalFees.toFixed(2)}</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-gray-600">Collected Fees</div>
                  <div className="text-xl font-bold text-green-700">${paymentStats.paidFees.toFixed(2)}</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-gray-600">Outstanding Fees</div>
                  <div className="text-xl font-bold text-yellow-700">${paymentStats.pendingFees.toFixed(2)}</div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleExportReport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Report
                </Button>
                <Label htmlFor="payment-upload" className="cursor-pointer">
                  <Button size="sm" variant="outline" asChild>
                    <span>
                      <Upload className="h-4 w-4 mr-2" />
                      Import Payments
                    </span>
                  </Button>
                  <Input
                    id="payment-upload"
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </Label>
              </div>
            </TabsContent>

            <TabsContent value="entries" className="space-y-4">
              {/* Search and Filter Controls */}
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <Label htmlFor="search">Search Entries</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                    <Input
                      id="search"
                      placeholder="Search by dog name, owner, or registration ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="status-filter">Filter by Status</Label>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as PaymentStatus | 'all')}>
                    <SelectTrigger id="status-filter" className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value={PaymentStatus.PENDING}>Pending</SelectItem>
                      <SelectItem value={PaymentStatus.PAID_BY_CHECK}>Paid by Check</SelectItem>
                      <SelectItem value={PaymentStatus.PAID_BY_CASH}>Paid by Cash</SelectItem>
                      <SelectItem value={PaymentStatus.PAID_ONLINE}>Paid Online</SelectItem>
                      <SelectItem value={PaymentStatus.REFUNDED}>Refunded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Payment Entries Table */}
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedEntries.length === filteredEntries.length && filteredEntries.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Dog / Owner</TableHead>
                      <TableHead>Registration ID</TableHead>
                      <TableHead>Fee Amount</TableHead>
                      <TableHead>Payment Status</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedEntries.includes(entry.id)}
                            onCheckedChange={(checked) => handleSelectEntry(entry.id, checked as boolean)}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{entry.dogName}</div>
                            <div className="text-sm text-gray-500">{entry.ownerName}</div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{entry.registrationId}</TableCell>
                        <TableCell className="font-medium">${entry.totalFee.toFixed(2)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getPaymentStatusIcon(entry.paymentStatus)}
                            <Badge className={getPaymentStatusBadgeColor(entry.paymentStatus)}>
                              {entry.paymentStatus}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>{entry.paymentMethod || '-'}</TableCell>
                        <TableCell className="font-mono text-sm">{entry.paymentReference || '-'}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              // Quick mark as paid
                              onPaymentStatusUpdate(entry.id, PaymentStatus.PAID_BY_CHECK);
                            }}
                          >
                            Mark Paid
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {filteredEntries.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No entries found matching your search criteria.
                </div>
              )}
            </TabsContent>

            <TabsContent value="bulk" className="space-y-4">
              <PermissionGuard permission={REGISTRATION_PERMISSIONS.BULK_OPERATIONS}>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Selected {selectedEntries.length} entries for bulk operation.
                    {selectedEntries.length === 0 && " Select entries from the Payment Entries tab first."}
                  </AlertDescription>
                </Alert>

                {selectedEntries.length > 0 && (
                  <div className="space-y-4 p-4 border rounded-lg bg-blue-50">
                    <h4 className="font-medium">Bulk Payment Update</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="bulk-status">Payment Status</Label>
                        <Select value={bulkPaymentStatus} onValueChange={(value) => setBulkPaymentStatus(value as PaymentStatus)}>
                          <SelectTrigger id="bulk-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={PaymentStatus.PAID_BY_CHECK}>Mark as Paid by Check</SelectItem>
                            <SelectItem value={PaymentStatus.PAID_BY_CASH}>Mark as Paid by Cash</SelectItem>
                            <SelectItem value={PaymentStatus.PENDING}>Reset to Pending</SelectItem>
                            <SelectItem value={PaymentStatus.REFUNDED}>Mark as Refunded</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="bulk-reference">Payment Reference</Label>
                        <Input
                          id="bulk-reference"
                          placeholder="Check number, batch ID, etc."
                          value={bulkReference}
                          onChange={(e) => setBulkReference(e.target.value)}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="reconciliation-notes">Reconciliation Notes</Label>
                      <Textarea
                        id="reconciliation-notes"
                        placeholder="Add notes about this bulk payment update..."
                        value={reconciliationNotes}
                        onChange={(e) => setReconciliationNotes(e.target.value)}
                        rows={3}
                      />
                    </div>
                    
                    <div className="flex gap-2">
                      <Button onClick={handleBulkPaymentUpdate}>
                        Apply to {selectedEntries.length} Entries
                      </Button>
                      <Button variant="outline" onClick={() => setSelectedEntries([])}>
                        <X className="h-4 w-4 mr-2" />
                        Clear Selection
                      </Button>
                    </div>
                  </div>
                )}
              </PermissionGuard>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </PermissionGuard>
  );
};