// PROTOTYPE — three structurally different projections of the same workflow.
import { ArrowRight, CalendarDays, ListFilter, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  PrototypeFocusPanel,
  PrototypePageHeader,
  PrototypeQueueTabs,
  PrototypeRegistrationSummary,
  PrototypeReviewBadge,
  PrototypeSearchAndScope,
} from './EntryManagementPrototypeShared';
import {
  registrationEntryCount,
  type PrototypeQueue,
  type PrototypeRegistration,
} from './entryManagementPrototypeData';

export interface PrototypeVariantProps {
  registrations: PrototypeRegistration[];
  focus: PrototypeRegistration;
  queue: PrototypeQueue;
  search: string;
  checkedIds: Set<string>;
  compactFocusOpen: boolean;
  onQueueChange: (queue: PrototypeQueue) => void;
  onSearchChange: (search: string) => void;
  onFocus: (registration: PrototypeRegistration) => void;
  onCheck: (registrationId: string) => void;
  onCloseCompactFocus: () => void;
}

function EmptyQueue() {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center px-6 text-center">
      <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-semibold">No matching registrations</p>
      <p className="mt-1 text-sm text-muted-foreground">Clear search or choose another queue.</p>
    </div>
  );
}

function Pagination() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
      <p className="text-muted-foreground">Showing 1–50 of 243 registrations</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled>
          Previous
        </Button>
        <Button variant="outline" size="sm">
          Next
        </Button>
      </div>
    </div>
  );
}

export function VariantA(props: PrototypeVariantProps) {
  return (
    <div className="mx-auto max-w-[1680px] space-y-5 px-4 py-5 sm:px-6">
      <PrototypePageHeader />
      <div className="space-y-3">
        <PrototypeQueueTabs queue={props.queue} onQueueChange={props.onQueueChange} />
        <PrototypeSearchAndScope search={props.search} onSearchChange={props.onSearchChange} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(38rem,1.2fr)_minmax(29rem,.8fr)]">
        <section
          className={cn(
            'overflow-hidden rounded-xl border bg-card shadow-sm',
            props.compactFocusOpen && 'hidden xl:block'
          )}
        >
          <div className="grid grid-cols-[auto_minmax(10rem,1.2fr)_minmax(8rem,.8fr)_auto_auto] gap-3 border-b bg-muted/35 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="w-5" />
            <span>Registration</span>
            <span>Entries</span>
            <span>Review</span>
            <span className="text-right">Payment / next action</span>
          </div>
          {props.registrations.length === 0 ? (
            <EmptyQueue />
          ) : (
            props.registrations.map(registration => (
              <PrototypeRegistrationSummary
                key={registration.id}
                registration={registration}
                selected={props.focus.id === registration.id}
                checked={props.checkedIds.has(registration.id)}
                onFocus={() => props.onFocus(registration)}
                onCheck={() => props.onCheck(registration.id)}
              />
            ))
          )}
          <Pagination />
        </section>
        <div className={cn('xl:sticky xl:top-4', !props.compactFocusOpen && 'hidden xl:block')}>
          <PrototypeFocusPanel
            key={props.focus.id}
            registration={props.focus}
            onBack={props.onCloseCompactFocus}
          />
        </div>
      </div>
    </div>
  );
}

export function VariantB(props: PrototypeVariantProps) {
  return (
    <div className="mx-auto max-w-[1760px] space-y-4 px-4 py-4 sm:px-6">
      <PrototypePageHeader compact />
      <div className="grid min-h-[calc(100vh-13rem)] overflow-hidden rounded-xl border bg-card shadow-sm xl:grid-cols-[14rem_minmax(19rem,.72fr)_minmax(31rem,1.28fr)]">
        <aside
          className={cn(
            'border-b bg-muted/20 p-3 xl:border-b-0 xl:border-r',
            props.compactFocusOpen && 'hidden xl:block'
          )}
        >
          <div className="mb-3 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <ListFilter className="h-4 w-4" aria-hidden />
            Work queues
          </div>
          <PrototypeQueueTabs queue={props.queue} onQueueChange={props.onQueueChange} vertical />
          <div className="mt-5 border-t pt-4">
            <p className="px-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Current scope
            </p>
            <button
              type="button"
              className="mt-2 w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="block font-medium">All trials</span>
              <span className="text-xs text-muted-foreground">Sunday, July 19</span>
            </button>
            <button
              type="button"
              className="mt-1 w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="block font-medium">All classes</span>
              <span className="text-xs text-muted-foreground">Both trials</span>
            </button>
          </div>
        </aside>

        <section
          className={cn(
            'border-b xl:border-b-0 xl:border-r',
            props.compactFocusOpen && 'hidden xl:block'
          )}
        >
          <div className="border-b p-3">
            <PrototypeSearchAndScope
              search={props.search}
              onSearchChange={props.onSearchChange}
              compact
            />
          </div>
          <div className="max-h-[calc(100vh-20rem)] overflow-y-auto xl:max-h-[calc(100vh-17rem)]">
            {props.registrations.length === 0 ? (
              <EmptyQueue />
            ) : (
              props.registrations.map(registration => (
                <PrototypeRegistrationSummary
                  key={registration.id}
                  registration={registration}
                  selected={props.focus.id === registration.id}
                  checked={props.checkedIds.has(registration.id)}
                  onFocus={() => props.onFocus(registration)}
                  onCheck={() => props.onCheck(registration.id)}
                  dense
                />
              ))
            )}
          </div>
          <Pagination />
        </section>

        <div className={cn('min-w-0', !props.compactFocusOpen && 'hidden xl:block')}>
          <PrototypeFocusPanel
            key={props.focus.id}
            registration={props.focus}
            borderless
            onBack={props.onCloseCompactFocus}
          />
        </div>
      </div>
    </div>
  );
}

export function VariantC(props: PrototypeVariantProps) {
  const upcoming = props.registrations.filter(registration => registration.id !== props.focus.id);
  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6">
      <PrototypePageHeader />
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              Review conveyor
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Finish the focused registration, then move to the next oldest item.
            </p>
          </div>
          <PrototypeQueueTabs queue={props.queue} onQueueChange={props.onQueueChange} />
        </div>
        <div className="mt-3">
          <PrototypeSearchAndScope search={props.search} onSearchChange={props.onSearchChange} />
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(34rem,1fr)_22rem]">
        <PrototypeFocusPanel key={props.focus.id} registration={props.focus} />
        <aside className="overflow-hidden rounded-xl border bg-card shadow-sm xl:sticky xl:top-4">
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Up next</h2>
                <p className="text-xs text-muted-foreground">Oldest submission first</p>
              </div>
              <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
          </div>
          {upcoming.length === 0 ? (
            <EmptyQueue />
          ) : (
            upcoming.map(registration => (
              <button
                type="button"
                key={registration.id}
                className="block w-full border-b p-4 text-left last:border-b-0 hover:bg-muted/40"
                onClick={() => props.onFocus(registration)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{registration.exhibitor}</p>
                    <p className="text-xs text-muted-foreground">
                      {registration.confirmation} · {registrationEntryCount(registration)} Entries
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
                <div className="mt-2">
                  <PrototypeReviewBadge label={registration.reviewLabel} />
                </div>
              </button>
            ))
          )}
          <div className="border-t p-3">
            <Button variant="outline" size="sm" className="w-full">
              View all 243 registrations
            </Button>
          </div>
        </aside>
      </div>
      <p
        className={cn(
          'text-center text-xs text-muted-foreground',
          props.checkedIds.size && 'pb-16'
        )}
      >
        Prototype only — actions do not save.
      </p>
    </div>
  );
}
