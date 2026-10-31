import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { FormChecklist, FormChecklistItem } from './formChecklist';
import { EntryFormPaymentMoreOptions } from './EntryFormPaymentMoreOptions';
import { STATUS_COMMAND_LABELS } from './reviewStateLabels';

interface EntryFormChecklistProps {
  checklist: FormChecklist;
  onBulkStatusChange: (entryIds: string[], status: EntryStatus) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onOpenEditEntry?: ((entry: EntryManagementEntry) => void) | undefined;
  /** The same openers the Payment section's menu uses (no second implementation). */
  payment: {
    openFullPayment: (method: 'cash' | 'check') => void;
    openPartialPayment: () => void;
    markPaidOnline: () => void;
  };
}

function ItemCard({
  item,
  actions,
  inline = false,
}: {
  item: FormChecklistItem;
  actions: ReactNode;
  inline?: boolean;
}) {
  return (
    <li
      className={
        inline
          ? 'flex items-center gap-3 rounded-[10px] border bg-card p-3'
          : 'rounded-[10px] border bg-card p-3'
      }
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{item.title}</p>
        {item.detail && <p className="text-sm text-muted-foreground">{item.detail}</p>}
      </div>
      {actions && (inline ? actions : <div className="mt-2.5 flex flex-wrap gap-2">{actions}</div>)}
    </li>
  );
}

/**
 * "To finish this form": one card per open item, each button a door to an
 * existing dialog or handler (MYK9-1600). With nothing open it collapses to one
 * green line saying what was done.
 */
export function EntryFormChecklist({
  checklist,
  onBulkStatusChange,
  onOpenArmbandDialog,
  onOpenEditEntry,
  payment,
}: EntryFormChecklistProps) {
  const { items, done } = checklist;

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-success/30 bg-success/10 px-3.5 py-3 text-sm text-success">
        <Check className="h-5 w-5 shrink-0" aria-hidden />
        <p>
          <strong className="font-bold">All set.</strong>
          {done.length > 0 && <> {done.join(' · ')}</>}
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label="To finish this form"
      className="rounded-xl border border-primary/25 bg-primary/5 p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          To finish this form
        </h3>
        <span className="text-sm font-semibold text-primary">{items.length} to do</span>
      </div>
      <ul className="mt-3 flex flex-col gap-2.5">
        {items.map(item => {
          switch (item.kind) {
            case 'review':
              return (
                <ItemCard
                  key={item.id}
                  item={item}
                  actions={
                    <>
                      <Button
                        size="sm"
                        className="min-h-11"
                        onClick={() => onBulkStatusChange(item.entryIds, EntryStatus.ACCEPTED)}
                      >
                        {STATUS_COMMAND_LABELS[EntryStatus.ACCEPTED]}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onBulkStatusChange(item.entryIds, EntryStatus.REJECTED)}
                      >
                        {STATUS_COMMAND_LABELS[EntryStatus.REJECTED]}
                      </Button>
                    </>
                  }
                />
              );
            case 'payment':
              return (
                <ItemCard
                  key={item.id}
                  item={item}
                  actions={
                    item.canRecord ? (
                      <>
                        <Button
                          size="sm"
                          className="min-h-11"
                          onClick={() => payment.openFullPayment('cash')}
                        >
                          Cash…
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => payment.openFullPayment('check')}
                        >
                          Check…
                        </Button>
                        <EntryFormPaymentMoreOptions
                          openPartialPayment={payment.openPartialPayment}
                          markPaidOnline={payment.markPaidOnline}
                        />
                      </>
                    ) : null
                  }
                />
              );
            case 'armband':
              return (
                <ItemCard
                  key={item.id}
                  item={item}
                  inline
                  actions={
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      aria-label={`Assign armband to ${item.entry.dogName}`}
                      onClick={() => onOpenArmbandDialog(item.entry)}
                    >
                      Assign
                    </Button>
                  }
                />
              );
            case 'registration-number':
              return (
                <ItemCard
                  key={item.id}
                  item={item}
                  inline
                  actions={
                    onOpenEditEntry ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        aria-label={`Add registration number for ${item.entry.dogName}`}
                        onClick={() => onOpenEditEntry(item.entry)}
                      >
                        Add number
                      </Button>
                    ) : null
                  }
                />
              );
            case 'missing-information':
              return <ItemCard key={item.id} item={item} actions={null} />;
          }
        })}
      </ul>
      {done.length > 0 && (
        <p className="mt-2.5 text-xs text-muted-foreground">Done: {done.join(' · ')}</p>
      )}
    </section>
  );
}
