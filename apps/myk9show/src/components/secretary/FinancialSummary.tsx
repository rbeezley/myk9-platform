import React, { useMemo, useState } from 'react';
import { useTrialEntries } from '@/hooks/queries/useTrialEntries';
import { exportToCSV } from '@/lib/export';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CardGridSkeleton, TableSkeleton } from '@/components/common/SkeletonLoaders';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, DollarSign, Users, Tag, Gift } from 'lucide-react';
import { paymentStatusColors } from '@/lib/financial-constants';
import {
  ListFilterBar,
  ListResultLine,
  summarizeFilters,
  type ListOptionsFilterField,
} from '@/components/list-toolkit';
import type { TrialFinancialEntryRow } from './financialSummaryTypes';
import { filterFinancialEntries } from './financialSummaryFilters';
import { resolveShowFinancialRows } from './showFinancialSummaryCalc';
import { UnresolvedMoneyRootNotice } from './UnresolvedMoneyRootNotice';

const PAYMENT_STATUS_OPTIONS: ListOptionsFilterField['options'] = [
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'comped', label: 'Comped' },
];

interface FinancialSummaryProps {
  trialId: string;
}

export const FinancialSummary: React.FC<FinancialSummaryProps> = ({ trialId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const { data: rawEntries = [], isLoading } = useTrialEntries(trialId);

  // Map raw entries to display rows
  const allEntries: TrialFinancialEntryRow[] = useMemo(
    () =>
      rawEntries.map(e => {
        const dog = e.dog;
        const owner = dog?.owner;
        const cls = e.class;
        const promo = e.promo_code;
        const raw = e as unknown as Record<string, unknown>;

        return {
          id: e.id,
          entryStatus: (raw.entry_status as string | null) ?? null,
          movedFromEntryId: (raw.moved_from_entry_id as string | null) ?? null,
          handler: e.handler,
          dogName: dog?.call_name || dog?.name || 'Unknown',
          ownerName: owner
            ? `${owner.first_name || ''} ${owner.last_name || ''}`.trim()
            : 'Unknown',
          className: cls?.name || 'Unknown',
          entryFee: (raw.entry_fee as number) || 0,
          discountAmount: (raw.discount_amount as number) || 0,
          promoCode: promo ? promo.code : null,
          paymentStatus: (raw.payment_status as string) || 'pending',
          comped: (raw.comped as boolean) || false,
          compedReason: raw.comped_reason as string | null,
        };
      }),
    [rawEntries]
  );

  // MYK9-639: one row per RUN, each carrying the money from wherever it is
  // recorded. The superseded half of a move-up never reaches the card, the
  // table or the CSV; the surviving row shows the fee and payment the exhibitor
  // actually made.
  const { rows: entries, unresolvedMoneyRootCount } = useMemo(
    () => resolveShowFinancialRows(allEntries),
    [allEntries]
  );

  // Filtered entries — the same function that computes each payment-status
  // option's count below, so the filter bar's counts always match what
  // picking them shows.
  const filteredEntries = useMemo(
    () => filterFinancialEntries(entries, searchTerm, statusFilter),
    [entries, searchTerm, statusFilter]
  );

  const paymentStatusField: ListOptionsFilterField = useMemo(
    () => ({
      kind: 'options',
      key: 'paymentStatus',
      label: 'Payment status',
      value: statusFilter,
      onChange: setStatusFilter,
      options: PAYMENT_STATUS_OPTIONS.map(option => ({
        ...option,
        count: filterFinancialEntries(entries, '', option.value).length,
      })),
    }),
    [entries, statusFilter]
  );

  // Summary calculations (single pass)
  const summary = useMemo(() => {
    const acc = {
      totalEntries: entries.length,
      totalFees: 0,
      totalDiscounts: 0,
      totalComped: 0,
      netAmount: 0,
      paidCount: 0,
      paidAmount: 0,
      pendingCount: 0,
      pendingAmount: 0,
      refundedCount: 0,
      refundedAmount: 0,
      compedCount: 0,
    };

    // Accumulate in integer cents — summing binary-float dollars drifts by a
    // penny on large shows, and a reconciliation total that disagrees with
    // Stripe by $0.01 erodes trust (MP-26). Divide once at the end.
    const toCents = (dollars: number) => Math.round(dollars * 100);
    for (const e of entries) {
      const feeCents = toCents(e.entryFee);
      const discountCents = toCents(e.discountAmount);
      acc.totalFees += feeCents;
      acc.totalDiscounts += discountCents;

      if (e.comped) {
        acc.compedCount++;
        acc.totalComped += feeCents;
      } else if (e.paymentStatus === 'paid') {
        acc.paidCount++;
        acc.paidAmount += feeCents - discountCents;
      } else if (e.paymentStatus === 'pending') {
        acc.pendingCount++;
        acc.pendingAmount += feeCents - discountCents;
      } else if (e.paymentStatus === 'refunded') {
        acc.refundedCount++;
        acc.refundedAmount += feeCents;
      }
    }

    acc.netAmount = acc.totalFees - acc.totalDiscounts - acc.totalComped;
    acc.totalFees /= 100;
    acc.totalDiscounts /= 100;
    acc.totalComped /= 100;
    acc.netAmount /= 100;
    acc.paidAmount /= 100;
    acc.pendingAmount /= 100;
    acc.refundedAmount /= 100;
    return acc;
  }, [entries]);

  const handleExportCSV = () => {
    const exportData = filteredEntries.map(e => ({
      Dog: e.dogName,
      Owner: e.ownerName,
      Handler: e.handler || '',
      Class: e.className,
      'Entry Fee': e.entryFee.toFixed(2),
      Discount: e.discountAmount.toFixed(2),
      'Promo Code': e.promoCode || '',
      'Payment Status': e.comped ? 'Comped' : e.paymentStatus,
      Comped: e.comped ? 'Yes' : 'No',
      'Comp Reason': e.compedReason || '',
    }));
    exportToCSV(exportData, `financial-summary-${trialId.slice(0, 8)}`);
  };

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading financial summary" className="space-y-4">
        <CardGridSkeleton items={5} />
        <TableSkeleton rows={6} columns={7} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <UnresolvedMoneyRootNotice
        count={unresolvedMoneyRootCount}
        remedy="The show-level Financial Summary counts them; this trial card cannot."
      />
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Financial Summary</h3>
          <p className="text-sm text-muted-foreground">
            Entry fees, discounts, and payment status overview
          </p>
        </div>
        <Button variant="outline" onClick={handleExportCSV} disabled={entries.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              Total Entries
            </div>
            <p className="text-2xl font-bold">{summary.totalEntries}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Total Fees
            </div>
            <p className="text-2xl font-bold">${summary.totalFees.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Tag className="h-4 w-4" />
              Discounts
            </div>
            <p className="text-2xl font-bold text-orange-600">
              -${summary.totalDiscounts.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Gift className="h-4 w-4" />
              Comped
            </div>
            <p className="text-2xl font-bold text-blue-600">-${summary.totalComped.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{summary.compedCount} entries</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Net Amount
            </div>
            <p className="text-2xl font-bold text-green-600">${summary.netAmount.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Status Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Payment Status Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-success/10 ">
              <div>
                <p className="text-sm font-medium text-success ">Paid</p>
                <p className="text-lg font-bold text-success ">{summary.paidCount}</p>
              </div>
              <p className="text-sm font-semibold text-success ">
                ${summary.paidAmount.toFixed(2)}
              </p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-warning/10 ">
              <div>
                <p className="text-sm font-medium text-warning ">Pending</p>
                <p className="text-lg font-bold text-warning ">{summary.pendingCount}</p>
              </div>
              <p className="text-sm font-semibold text-warning ">
                ${summary.pendingAmount.toFixed(2)}
              </p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 ">
              <div>
                <p className="text-sm font-medium text-destructive ">Refunded</p>
                <p className="text-lg font-bold text-destructive ">{summary.refundedCount}</p>
              </div>
              <p className="text-sm font-semibold text-destructive ">
                ${summary.refundedAmount.toFixed(2)}
              </p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-info/10 ">
              <div>
                <p className="text-sm font-medium text-info ">Comped</p>
                <p className="text-lg font-bold text-info ">{summary.compedCount}</p>
              </div>
              <p className="text-sm font-semibold text-info ">${summary.totalComped.toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entry Table. The sentence below is not its own live region
          (`announce={false}`): `UnresolvedMoneyRootNotice` above already owns
          this card's one `role="status"` (MYK9-639). */}
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3">
          <CardTitle className="text-base">Entry Details</CardTitle>
          <ListFilterBar
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Search entries..."
            fields={[paymentStatusField]}
          />
          <ListResultLine
            announce={false}
            shown={filteredEntries.length}
            total={entries.length}
            noun={['entry', 'entries']}
            filtered={searchTerm.trim() !== '' || statusFilter !== null}
            filterSummary={summarizeFilters({ search: searchTerm, fields: [paymentStatusField] })}
            onShowAll={() => {
              setSearchTerm('');
              setStatusFilter(null);
            }}
          />
        </CardHeader>
        <CardContent>
          {filteredEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {entries.length === 0
                ? 'No entries for this trial yet.'
                : 'No entries match your filters.'}
            </p>
          ) : (
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dog</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead>Promo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map(entry => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.dogName}</TableCell>
                      <TableCell>{entry.ownerName}</TableCell>
                      <TableCell>{entry.className}</TableCell>
                      <TableCell className="text-right">${entry.entryFee.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        {entry.discountAmount > 0 ? (
                          <span className="text-orange-600">
                            -${entry.discountAmount.toFixed(2)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {entry.promoCode ? (
                          <Badge variant="outline" className="font-mono text-xs">
                            {entry.promoCode}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {entry.comped ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge className={paymentStatusColors.waived}>Comped</Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{entry.compedReason || 'No reason provided'}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Badge className={paymentStatusColors[entry.paymentStatus] || ''}>
                            {entry.paymentStatus}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
