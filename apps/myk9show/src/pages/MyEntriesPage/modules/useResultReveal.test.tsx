/**
 * Unit coverage for the result-reveal cluster extracted from MyEntriesPage
 * (MYK9-217). The `?resultEntryId=` deep link is exercised here WITHOUT
 * mounting the page — a router around the hook is the whole harness.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import React from 'react';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

import {
  collectSeenResultReleaseKeys,
  findResultRevealModel,
  useResultReveal,
} from './useResultReveal';
import type { EntryClass, MyEntry, MyEntryDogGroup } from './my-entries-types';

function classRow(overrides: Partial<EntryClass> = {}): EntryClass {
  return {
    id: 'class-row-1',
    name: 'Novice Container',
    number: '101',
    fee: 30,
    status: 'entered',
    resultStatus: 'qualified',
    resultsReleasedAt: '2026-08-20T18:00:00.000Z',
    finalPlacement: 2,
    ...overrides,
  };
}

function dogGroup(overrides: Partial<MyEntryDogGroup> = {}): MyEntryDogGroup {
  return {
    id: 'dog-group-1',
    dogId: 'dog-1',
    dogName: 'Cooper',
    classes: [classRow()],
    entryStatus: EntryStatus.ACCEPTED,
    ...overrides,
  };
}

function order(dogs: MyEntryDogGroup[]): MyEntry {
  const first = dogs[0];
  return {
    id: 'order-1',
    registrationId: 'reg-1',
    showId: 'show-1',
    showName: 'Autumn Trial',
    showDate: new Date('2026-08-19T12:00:00Z'),
    location: { venue: 'Fairgrounds', city: 'Tulsa', state: 'OK' },
    dogName: first.dogName,
    dogId: first.dogId,
    classes: first.classes,
    dogs,
    totalFee: 30,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-08-01T12:00:00Z'),
    lastUpdated: new Date('2026-08-02T12:00:00Z'),
  };
}

function harness(initialUrl: string) {
  let location = '';
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialUrl]}>
      <LocationProbe onChange={value => (location = value)} />
      {children}
    </MemoryRouter>
  );
  return { wrapper, currentUrl: () => location };
}

function LocationProbe({ onChange }: { onChange: (url: string) => void }) {
  const { pathname, search } = useLocation();
  onChange(`${pathname}${search}`);
  return null;
}

beforeEach(() => {
  localStorage.clear();
});

describe('findResultRevealModel', () => {
  it('resolves the deep-linked class row through its owning dog', () => {
    // The model is scoped to the DOG that owns the row, not to the order —
    // an order can span several dogs and the card names one of them.
    const entries = [
      order([
        dogGroup({ id: 'a', dogId: 'dog-a', dogName: 'Cooper', classes: [classRow({ id: 'r1' })] }),
        dogGroup({ id: 'b', dogId: 'dog-b', dogName: 'Juno', classes: [classRow({ id: 'r2' })] }),
      ]),
    ];

    expect(findResultRevealModel(entries, 'r2')?.dogName).toBe('Juno');
    expect(findResultRevealModel(entries, 'r1')?.dogName).toBe('Cooper');
  });

  it('returns null for an id no dog on any order owns', () => {
    expect(findResultRevealModel([order([dogGroup()])], 'not-a-row')).toBeNull();
  });

  it('returns null when the owning row has no releasable result', () => {
    // Owning the row and having something to reveal are different questions:
    // a deep link to a row whose results are not released yet is "nothing to
    // show", which the caller must distinguish from a match so it leaves the
    // param in place. (Whether the scan stops at the owning dog or runs on is
    // unobservable — a row id belongs to exactly one dog — so this pins the
    // null, not the loop shape.)
    const entries = [
      order([
        dogGroup({
          classes: [classRow({ id: 'r1', resultsReleasedAt: undefined })],
        }),
      ]),
    ];
    expect(findResultRevealModel(entries, 'r1')).toBeNull();
  });
});

describe('collectSeenResultReleaseKeys', () => {
  it('collects only the release keys this browser has already revealed', () => {
    const seenRow = classRow({ id: 'seen', finalPlacement: 1 });
    const entries = [
      order([dogGroup({ classes: [seenRow, classRow({ id: 'unseen', finalPlacement: 3 })] })]),
    ];
    const seenKey = findResultRevealModel(entries, 'seen')!.releaseKey;
    localStorage.setItem(`myk9:result-reveal-seen:${seenKey}`, '1');

    expect(collectSeenResultReleaseKeys(entries)).toEqual(new Set([seenKey]));
  });

  it('ignores rows with no releasable result rather than keying on the row id', () => {
    const entries = [order([dogGroup({ classes: [classRow({ resultStatus: 'nq' })] })])];
    expect(collectSeenResultReleaseKeys(entries)).toEqual(new Set());
  });
});

describe('useResultReveal — ?resultEntryId= deep link', () => {
  const entries = [order([dogGroup({ classes: [classRow({ id: 'row-1' })] })])];

  it('opens the reveal named by the param and strips the param', async () => {
    // Stripping matters: leaving it in place re-opens the reveal on a refresh
    // or a Back, after the exhibitor already dismissed it.
    const { wrapper, currentUrl } = harness('/my-entries?resultEntryId=row-1&tab=upcoming');
    const { result } = renderHook(() => useResultReveal(entries), { wrapper });

    await waitFor(() => expect(result.current.resultRevealModel?.entryId).toBe('row-1'));
    await waitFor(() => expect(currentUrl()).toBe('/my-entries?tab=upcoming'));
  });

  it('leaves unrelated params alone', async () => {
    const { wrapper, currentUrl } = harness(
      '/my-entries?waitlistOffer=offer-9&resultEntryId=row-1'
    );
    renderHook(() => useResultReveal(entries), { wrapper });

    await waitFor(() => expect(currentUrl()).toBe('/my-entries?waitlistOffer=offer-9'));
  });

  it('keeps the param when the id resolves to nothing, so a late sync can still honour it', async () => {
    // Entries replicate asynchronously. Consuming the param before the row
    // exists would silently drop the deep link the exhibitor followed.
    const { wrapper, currentUrl } = harness('/my-entries?resultEntryId=not-yet-synced');
    const { result } = renderHook(() => useResultReveal(entries), { wrapper });

    await waitFor(() => expect(currentUrl()).toBe('/my-entries?resultEntryId=not-yet-synced'));
    expect(result.current.resultRevealModel).toBeNull();
  });

  it('does not reopen a reveal the exhibitor closed', async () => {
    const { wrapper } = harness('/my-entries?resultEntryId=row-1');
    const { result } = renderHook(() => useResultReveal(entries), { wrapper });

    await waitFor(() => expect(result.current.resultRevealModel).not.toBeNull());
    act(() => result.current.closeResultReveal());

    await waitFor(() => expect(result.current.resultRevealModel).toBeNull());
    expect(result.current.resultRevealModel).toBeNull();
  });

  it('opens nothing when no param is present', async () => {
    const { wrapper } = harness('/my-entries');
    const { result } = renderHook(() => useResultReveal(entries), { wrapper });

    await waitFor(() => expect(result.current.seenResultReleaseKeys).toEqual(new Set()));
    expect(result.current.resultRevealModel).toBeNull();
  });
});

describe('useResultReveal — seen markers', () => {
  const entries = [order([dogGroup({ classes: [classRow({ id: 'row-1' })] })])];

  it('records a reveal as seen in storage and in the returned set', async () => {
    const { wrapper } = harness('/my-entries');
    const { result } = renderHook(() => useResultReveal(entries), { wrapper });
    const key = findResultRevealModel(entries, 'row-1')!.releaseKey;

    act(() => result.current.markSeen(key));

    await waitFor(() => expect(result.current.seenResultReleaseKeys.has(key)).toBe(true));
    expect(localStorage.getItem(`myk9:result-reveal-seen:${key}`)).toBe('1');
  });

  it('seeds the set from storage on mount', async () => {
    const key = findResultRevealModel(entries, 'row-1')!.releaseKey;
    localStorage.setItem(`myk9:result-reveal-seen:${key}`, '1');

    const { wrapper } = harness('/my-entries');
    const { result } = renderHook(() => useResultReveal(entries), { wrapper });

    await waitFor(() => expect(result.current.seenResultReleaseKeys).toEqual(new Set([key])));
  });
});
