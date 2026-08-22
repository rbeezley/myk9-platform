/**
 * Entry Receipt Component
 *
 * Printable receipt for show entries. Can be printed directly or saved as PDF
 * via the browser's print dialog.
 */

import { useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Printer, X } from 'lucide-react';
import { CONFIRMATION_NUMBER_LABEL } from '@/features/registration/confirmationNumberDisplay';
import { formatEntryDate, formatRecordDateTime } from '@/lib/format/dates';

interface EntryClass {
  id: string;
  name: string;
  number: string;
  fee: number;
  jumpHeight?: string;
  runOrder?: number;
  status: 'entered' | 'scratched' | 'moved' | 'absent';
}

interface EntryReceiptData {
  id: string;
  confirmationNumber: string;
  showName: string;
  showDate: Date;
  location: {
    venue: string;
    city: string;
    state: string;
  };
  dogName: string;
  handler?: string;
  classes: EntryClass[];
  totalFee: number;
  /**
   * Money breakdown from stripe_orders, present only for an order-scoped
   * receipt. Absent for a card-derived one (cash, check, or a Stripe order we
   * could not read), which prints the entry-fee total and claims nothing about
   * a charge.
   *
   * When present these MUST balance: entrySubtotal + platformFee =
   * amountCharged, and amountCharged - refunded = netPaid. The platform fee is
   * billed as its own Stripe line on top of the entry fees, so a receipt that
   * prints the gross without the fee row overstates its own line items.
   */
  charge?: {
    entrySubtotal: number;
    platformFee: number;
    amountCharged: number;
    refunded: number;
    netPaid: number;
  };
  currency?: string;
  paymentReference?: string | null;
  orderId?: string;
  submittedAt: Date;
  paymentStatus: string;
}

interface EntryReceiptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: EntryReceiptData;
  exhibitorName?: string;
  exhibitorEmail?: string;
  /**
   * Why this receipt shows entry fees instead of the exact amount charged.
   * Shown on screen and deliberately NOT printed — the printed document should
   * carry the figures, not a transient sync message.
   */
  notice?: string;
  /** Offered beside a notice so the reader can try for the exact figures. */
  onRetry?: () => void;
}

export function EntryReceipt({
  open,
  onOpenChange,
  entry,
  notice,
  onRetry,
  exhibitorName,
  exhibitorEmail,
}: EntryReceiptProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to print the receipt');
      return;
    }

    const styles = `
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.5;
          color: #1a1a1a;
          padding: 40px;
          max-width: 800px;
          margin: 0 auto;
        }
        .receipt-header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #e5e5e5;
        }
        .receipt-title {
          font-size: 24px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 5px;
        }
        .receipt-subtitle {
          font-size: 14px;
          color: #666;
        }
        .confirmation-box {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 15px 20px;
          margin-bottom: 25px;
          text-align: center;
        }
        .confirmation-label {
          font-size: 12px;
          color: #666;
          letter-spacing: 1px;
        }
        .confirmation-number {
          font-size: 28px;
          font-weight: 700;
          font-family: 'Courier New', monospace;
          color: #1a1a1a;
        }
        .section {
          margin-bottom: 25px;
        }
        .section-title {
          font-size: 14px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
          padding-bottom: 5px;
          border-bottom: 1px solid #e5e5e5;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }
        .info-item {
          margin-bottom: 8px;
        }
        .info-label {
          font-size: 12px;
          color: #666;
        }
        .info-value {
          font-size: 14px;
          font-weight: 500;
          color: #1a1a1a;
        }
        .classes-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        .classes-table th {
          text-align: left;
          padding: 10px 8px;
          font-size: 12px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          border-bottom: 2px solid #e5e5e5;
        }
        .classes-table td {
          padding: 12px 8px;
          font-size: 14px;
          border-bottom: 1px solid #f0f0f0;
        }
        .classes-table .fee {
          text-align: right;
          font-family: 'Courier New', monospace;
        }
        .classes-table .scratched {
          text-decoration: line-through;
          color: #999;
        }
        .total-section {
          margin-top: 20px;
          padding-top: 15px;
          border-top: 2px solid #e5e5e5;
          display: flex;
          justify-content: flex-end;
        }
        .total-box {
          text-align: right;
        }
        .total-label {
          font-size: 14px;
          color: #666;
        }
        .total-amount {
          font-size: 24px;
          font-weight: 700;
          font-family: 'Courier New', monospace;
          color: #1a1a1a;
        }
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e5e5e5;
          text-align: center;
          font-size: 12px;
          color: #999;
        }
        .status-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }
        .status-paid {
          background: #dcfce7;
          color: #166534;
        }
        .status-pending {
          background: #fef3c7;
          color: #92400e;
        }
        @media print {
          body {
            padding: 20px;
          }
          .no-print {
            display: none !important;
          }
        }
      </style>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Entry Receipt - ${entry.confirmationNumber}</title>
          ${styles}
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    // Wait for content to load before printing
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const formatCurrency = (amount: number) => {
    // Intl throws RangeError on a malformed code, and a bad `currency` column
    // would then blank the whole receipt rather than one label. A receipt in
    // the wrong currency symbol is a defect; a receipt that will not render is
    // a worse one.
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: entry.currency?.toUpperCase() || 'USD',
      }).format(amount);
    } catch {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    }
  };

  const formatLocation = () => {
    const parts = [entry.location.venue, entry.location.city, entry.location.state].filter(Boolean);
    return parts.join(', ') || 'Location TBD';
  };

  const activeClasses = entry.classes.filter(c => c.status !== 'scratched');
  const pulledClasses = entry.classes.filter(c => c.status === 'scratched');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Entry Receipt
          </DialogTitle>
          <DialogDescription>Print or save this receipt for your records</DialogDescription>
        </DialogHeader>

        {notice && (
          <div
            className="no-print flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            role="status"
          >
            <span>{notice}</span>
            {onRetry && (
              <Button variant="outline" size="sm" className="min-h-11" onClick={onRetry}>
                Try again
              </Button>
            )}
          </div>
        )}

        {/* Printable Content */}
        <div ref={printRef} className="bg-card p-6 rounded-lg">
          {/* Header */}
          <div className="receipt-header text-center mb-6 pb-4 border-b-2">
            <h1 className="receipt-title text-2xl font-bold">Entry Confirmation</h1>
            <p className="receipt-subtitle text-sm text-muted-foreground">myK9Show</p>
          </div>

          {/* Confirmation # */}
          <div className="confirmation-box bg-muted/50 rounded-lg p-4 mb-6 text-center">
            <div className="confirmation-label text-xs text-muted-foreground tracking-wider">
              {CONFIRMATION_NUMBER_LABEL}
            </div>
            <div className="confirmation-number text-2xl font-bold font-mono">
              {entry.confirmationNumber}
            </div>
          </div>

          {/* Show Information */}
          <div className="section mb-6">
            <h2 className="section-title text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 pb-2 border-b">
              Show Information
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="info-item">
                <div className="info-label text-xs text-muted-foreground">Show Name</div>
                <div className="info-value font-medium">{entry.showName}</div>
              </div>
              <div className="info-item">
                <div className="info-label text-xs text-muted-foreground">Date</div>
                <div className="info-value font-medium">
                  {formatEntryDate(entry.showDate, { style: 'long' })}
                </div>
              </div>
              <div className="info-item col-span-2">
                <div className="info-label text-xs text-muted-foreground">Location</div>
                <div className="info-value font-medium">{formatLocation()}</div>
              </div>
            </div>
          </div>

          {/* Entry Details */}
          <div className="section mb-6">
            <h2 className="section-title text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 pb-2 border-b">
              Entry Details
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="info-item">
                <div className="info-label text-xs text-muted-foreground">Dog</div>
                <div className="info-value font-medium">{entry.dogName}</div>
              </div>
              <div className="info-item">
                <div className="info-label text-xs text-muted-foreground">Handler</div>
                <div className="info-value font-medium">
                  {entry.handler || exhibitorName || 'Not specified'}
                </div>
              </div>
              {exhibitorEmail && (
                <div className="info-item">
                  <div className="info-label text-xs text-muted-foreground">Email</div>
                  <div className="info-value font-medium">{exhibitorEmail}</div>
                </div>
              )}
              <div className="info-item">
                <div className="info-label text-xs text-muted-foreground">Submitted</div>
                <div className="info-value font-medium">
                  {formatRecordDateTime(entry.submittedAt)}
                </div>
              </div>
            </div>
          </div>

          {/* Classes Entered */}
          <div className="section mb-6">
            <h2 className="section-title text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 pb-2 border-b">
              Classes Entered
            </h2>
            <table className="classes-table w-full">
              <thead>
                <tr className="border-b-2">
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Class
                  </th>
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Jump Height
                  </th>
                  <th className="text-right py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Fee
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeClasses.map(cls => (
                  <tr key={cls.id} className="border-b">
                    <td className="py-3">
                      {cls.name}
                      {cls.number && <span className="text-muted-foreground"> #{cls.number}</span>}
                    </td>
                    <td className="py-3">{cls.jumpHeight || '-'}</td>
                    <td className="py-3 text-right font-mono">{formatCurrency(cls.fee)}</td>
                  </tr>
                ))}
                {pulledClasses.map(cls => (
                  <tr key={cls.id} className="border-b text-muted-foreground line-through">
                    <td className="py-3">
                      {cls.name}
                      {cls.number && <span> #{cls.number}</span>}
                      <span className="ml-2 text-xs">(Pulled)</span>
                    </td>
                    <td className="py-3">{cls.jumpHeight || '-'}</td>
                    <td className="py-3 text-right font-mono">{formatCurrency(cls.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals. Every figure a reader can add up for themselves. */}
            <div className="total-section mt-4 pt-4 border-t-2 flex justify-end">
              {entry.charge === undefined ? (
                <div className="text-right">
                  {/* Card-derived: the entry fees, making no claim about a charge. */}
                  <div className="total-label text-sm text-muted-foreground">Total</div>
                  <div className="total-amount text-2xl font-bold font-mono">
                    {formatCurrency(
                      activeClasses.reduce((sum, classEntry) => sum + classEntry.fee, 0)
                    )}
                  </div>
                </div>
              ) : (
                <dl className="w-full max-w-xs space-y-1 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Entry fees</dt>
                    <dd className="font-mono">{formatCurrency(entry.charge.entrySubtotal)}</dd>
                  </div>
                  {entry.charge.platformFee !== 0 && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Platform fee</dt>
                      <dd className="font-mono">{formatCurrency(entry.charge.platformFee)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 border-t pt-1">
                    <dt className={entry.charge.refunded === 0 ? 'font-semibold' : ''}>
                      Amount charged
                    </dt>
                    <dd
                      className={
                        entry.charge.refunded === 0
                          ? 'total-amount font-mono text-lg font-bold'
                          : 'font-mono'
                      }
                    >
                      {formatCurrency(entry.charge.amountCharged)}
                    </dd>
                  </div>
                  {entry.charge.refunded !== 0 && (
                    <>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Refunded</dt>
                        <dd className="font-mono">-{formatCurrency(entry.charge.refunded)}</dd>
                      </div>
                      <div className="flex justify-between gap-4 border-t pt-1">
                        <dt className="font-semibold">Net paid</dt>
                        <dd className="total-amount font-mono text-lg font-bold">
                          {formatCurrency(entry.charge.netPaid)}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
              )}
            </div>
          </div>

          {/* Payment Status */}
          <div className="section mb-6">
            <h2 className="section-title text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 pb-2 border-b">
              Payment Status
            </h2>
            <span
              className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                entry.paymentStatus === 'Paid'
                  ? 'bg-teal-100 text-teal-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {entry.paymentStatus}
            </span>
            {entry.paymentReference && (
              <div className="info-item mt-3">
                <div className="info-label text-xs text-muted-foreground">Payment reference</div>
                <div className="info-value break-all font-mono text-sm">
                  {entry.paymentReference}
                </div>
              </div>
            )}
            {entry.orderId && (
              <div className="info-item mt-3">
                <div className="info-label text-xs text-muted-foreground">Order ID</div>
                <div className="info-value break-all font-mono text-sm">{entry.orderId}</div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="footer mt-8 pt-4 border-t text-center text-xs text-muted-foreground">
            <p>Thank you for your entry!</p>
            <p className="mt-1">Entry ID: {entry.id}</p>
            <p className="mt-1">Generated on {formatRecordDateTime(new Date())}</p>
          </div>
        </div>

        <Separator />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print / Save as PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
