import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter } from 'lucide-react';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

interface EntryFiltersCardProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  paymentFilter: string;
  setPaymentFilter: (payment: string) => void;
  onClearFilters: () => void;
}

/**
 * Filters card for entry management
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */
export const EntryFiltersCard: React.FC<EntryFiltersCardProps> = ({
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  paymentFilter,
  setPaymentFilter,
  onClearFilters,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Filters
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search entries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Entry Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value={EntryStatus.PENDING}>Pending</SelectItem>
              <SelectItem value={EntryStatus.ACCEPTED}>Accepted</SelectItem>
              <SelectItem value={EntryStatus.WAITLIST}>Waitlist</SelectItem>
              <SelectItem value={EntryStatus.REJECTED}>Rejected</SelectItem>
              <SelectItem value={EntryStatus.MISSING_INFO}>Missing Info</SelectItem>
            </SelectContent>
          </Select>

          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Payment Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value={PaymentStatus.PENDING}>Payment Due</SelectItem>
              <SelectItem value={PaymentStatus.PAID_ONLINE}>Paid Online</SelectItem>
              <SelectItem value={PaymentStatus.PAID_BY_CHECK}>Paid by Check</SelectItem>
              <SelectItem value={PaymentStatus.REFUNDED}>Refunded</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={onClearFilters}>
            Clear Filters
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default EntryFiltersCard;
