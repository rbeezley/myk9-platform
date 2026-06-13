import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { exportToCSV } from '@/lib/export';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, DollarSign, Users, Tag, Gift, Loader2, Search, ChevronDown } from 'lucide-react';
import { getEntriesByShowForFinancials } from '@/services/database/entries';
import { paymentStatusColors } from '@/lib/financial-constants';

interface ShowFinancialSummaryProps {
  showId: string;
}

interface EntryRow {
  id: string;
  trialId: string;
  trialName: string;
  handler: string | null;
  dogName: string;
  ownerName: string;
  className: string;
  entryFee: number;
  discountAmount: number;
  promoCode: string | null;
  paymentStatus: string;
  comped: boolean;
  compedReason: string | null;
}

interface TrialSubtotal {
  trialId: string;
  trialName: string;
  entryCount: number;
  totalFees: number;
  totalDiscounts: number;
  totalComped: number;
  netAmount: number;
}

export const ShowFinancialSummary: React.FC<ShowFinancialSummaryProps> = ({ showId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [trialFilter, setTrialFilter] = useState<string>('all');
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const { data: rawEntries = [], isLoading } = useQuery({
    queryKey: queryKeys.showFinancialSummary(showId),
    queryFn: async () => {
      const { data, error } = await getEntriesByShowForFinancials(showId);
      if (error) throw error;
      return data;
    },
    enabled: !!showId,
    ...cacheStrategies.dynamic,
  });

  const entries: EntryRow[] = useMemo(
    () =>
      rawEntries.map((e: Record<string, unknown>) => {
        const dog = e.dog as Record<string, unknown> | null;
        const owner = dog?.owner as Record<string, unknown> | null;
        const cls = e.class as Record<string, unknown> | null;
        const promo = e.promo_code as Record<string, unknown> | null;
        const trial = e.trial as Record<string, unknown> | null;

        return {
          id: e.id as string,
          trialId: (trial?.id as string) || '',
          trialName: (trial?.name as string) || 'Unknown Trial',
          handler: e.handler as string | null,
          dogName: (dog?.call_name as string) || (dog?.name as string) || 'Unknown',
          ownerName: owner
            ? `${owner.first_name || ''} ${owner.last_name || ''}`.trim()
            : 'Unknown',
          className: (cls?.name as string) || 'Unknown',
          entryFee: (e.entry_fee as number) || 0,
          discountAmount: (e.discount_amount as number) || 0,
          promoCode: promo ? (promo.code as string) : null,
          paymentStatus: (e.payment_status as string) || 'pending',
          comped: (e.comped as boolean) || false,
          compedReason: e.comped_reason as string | null,
        };
      }),
    [rawEntries]
  );

  // Single-pass: compute summary, trial subtotals, and trial options together
  const { summary, trialSubtotals, trialOptions } = useMemo(() => {
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
    const subtotalMap = new Map<string, TrialSubtotal>();

    for (const e of entries) {
      acc.totalFees += e.entryFee;
      acc.totalDiscounts += e.discountAmount;

      if (e.comped) {
        acc.compedCount++;
        acc.totalComped += e.entryFee;
      } else if (e.paymentStatus === 'paid') {
        acc.paidCount++;
        acc.paidAmount += e.entryFee - e.discountAmount;
      } else if (e.paymentStatus === 'pending') {
        acc.pendingCount++;
        acc.pendingAmount += e.entryFee - e.discountAmount;
      } else if (e.paymentStatus === 'refunded') {
        acc.refundedCount++;
        acc.refundedAmount += e.entryFee;
      }

      let sub = subtotalMap.get(e.trialId);
      if (!sub) {
        sub = {
          trialId: e.trialId,
          trialName: e.trialName,
          entryCount: 0,
          totalFees: 0,
          totalDiscounts: 0,
          totalComped: 0,
          netAmount: 0,
        };
        subtotalMap.set(e.trialId, sub);
      }
      sub.entryCount++;
      sub.totalFees += e.entryFee;
      sub.totalDiscounts += e.discountAmount;
      if (e.comped) sub.totalComped += e.entryFee;
    }

    acc.netAmount = acc.totalFees - acc.totalDiscounts - acc.totalComped;

    const subtotals: TrialSubtotal[] = [];
    const options: [string, string][] = [];
    for (const sub of subtotalMap.values()) {
      sub.netAmount = sub.totalFees - sub.totalDiscounts - sub.totalComped;
      subtotals.push(sub);
      options.push([sub.trialId, sub.trialName]);
    }
    subtotals.sort((a, b) => a.trialName.localeCompare(b.trialName));
    options.sort((a, b) => a[1].localeCompare(b[1]));

    return { summary: acc, trialSubtotals: subtotals, trialOptions: options };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (trialFilter !== 'all') {
      result = result.filter(e => e.trialId === trialFilter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        e =>
          e.dogName.toLowerCase().includes(term) ||
          e.ownerName.toLowerCase().includes(term) ||
          e.handler?.toLowerCase().includes(term) ||
          e.className.toLowerCase().includes(term) ||
          e.trialName.toLowerCase().includes(term)
      );
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'comped') {
        result = result.filter(e => e.comped);
      } else {
        result = result.filter(e => e.paymentStatus === statusFilter && !e.comped);
      }
    }
    return result;
  }, [entries, searchTerm, statusFilter, trialFilter]);

  const handleExportCSV = () => {
    const exportData = filteredEntries.map(e => ({
      Trial: e.trialName,
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
    exportToCSV(exportData, `show-financial-summary-${showId.slice(0, 8)}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Financial Summary</h3>
          <p className="text-sm text-muted-foreground">
            Aggregated entry fees, discounts, and payments across all trials
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

      {/* Per-Trial Breakdown */}
      {trialSubtotals.length > 1 && (
        <Card>
          <CardHeader
            className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setBreakdownOpen(v => !v)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Per-Trial Breakdown</CardTitle>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${breakdownOpen ? 'rotate-180' : ''}`}
              />
            </div>
          </CardHeader>
          {breakdownOpen && (
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trial</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                    <TableHead className="text-right">Fees</TableHead>
                    <TableHead className="text-right">Discounts</TableHead>
                    <TableHead className="text-right">Comped</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trialSubtotals.map(sub => (
                    <TableRow key={sub.trialId}>
                      <TableCell className="font-medium">{sub.trialName}</TableCell>
                      <TableCell className="text-right">{sub.entryCount}</TableCell>
                      <TableCell className="text-right">${sub.totalFees.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-orange-600">
                        {sub.totalDiscounts > 0 ? `-$${sub.totalDiscounts.toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right text-blue-600">
                        {sub.totalComped > 0 ? `-$${sub.totalComped.toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        ${sub.netAmount.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      )}

      {/* Payment Status Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Payment Status Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950">
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-200">Paid</p>
                <p className="text-lg font-bold text-green-900 dark:text-green-100">
                  {summary.paidCount}
                </p>
              </div>
              <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                ${summary.paidAmount.toFixed(2)}
              </p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950">
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Pending</p>
                <p className="text-lg font-bold text-yellow-900 dark:text-yellow-100">
                  {summary.pendingCount}
                </p>
              </div>
              <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-300">
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
            <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Comped</p>
                <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                  {summary.compedCount}
                </p>
              </div>
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                ${summary.totalComped.toFixed(2)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entry Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Entry Details</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search entries..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-8 w-[200px]"
                />
              </div>
              {trialOptions.length > 1 && (
                <Select value={trialFilter} onValueChange={setTrialFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Trials</SelectItem>
                    {trialOptions.map(([id, name]) => (
                      <SelectItem key={id} value={id}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                  <SelectItem value="comped">Comped</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {entries.length === 0
                ? 'No entries for this show yet.'
                : 'No entries match your filters.'}
            </p>
          ) : (
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trial</TableHead>
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
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.trialName}
                      </TableCell>
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
