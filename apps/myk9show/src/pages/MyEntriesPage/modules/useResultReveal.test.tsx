/**
 * Unit coverage for the result-reveal cluster extracted from MyEntriesPage
 * (MYK9-217). The `?resultEntryId=` deep link is exercised here WITHOUT
 * mounting the page — a router around the hook is the whole harness.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
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

/**
 * A router around the hook, plus two handles the tests need: what the URL
 * currently is, and a way to navigate AFTER mount. Without the second, every
 * test would arrive with its param already present, and an implementation
 * that read the param exactly once on mount would pass everything.
 */
function harness(initialUrl: string) {
  let location = '';
  let go: (url: string) => void = () => {
    throw new Error('router not mounted');
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialUrl]}>
      <RouterProbe
        onLocation={value => (location = value)}
        onNavigate={navigate => (go = navigate)}
      />
      {children}
    </MemoryRouter>
  );
  return { wrapper, currentUrl: () => location, navigate: (url: string) => go(url) };
}

function RouterProbe({
  onLocation,
  onNavigate,
}: {
  onLocation: (url: string) => void;
  onNavigate: (navigate: (url: string) => void) => void;
}) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  onLocation(`${pathname}${search}`);
  onNavigate(navigate);
  return null;
}

/** Renders the hook with `entries` as a prop, so a test can simulate a late
 *  replication sync by rerendering with a different array. */
function renderResultReveal(initialUrl: string, initialEntries: MyEntry[] = []) {
  const { wrapper, currentUrl, navigate } = harness(initialUrl);
  const view = renderHook(({ entries }: { entries: MyEntry[] }) => useResultReveal(entries), {
    wrapper,
    initialProps: { entries: initialEntries },
  });
  return { ...view, currentUrl, navigate };
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
    // A release key is `id:releasedAt:status:placement`, never the bare row id.
    // Seeding the ROW ID as if it were a key is what makes this test able to
    // see the difference: an implementation that fell back to `cls.id` when no
    // model could be built would return a non-empty set here.
    const entries = [order([dogGroup({ classes: [classRow({ resultStatus: 'nq' })] })])];
    localStorage.setItem('myk9:result-reveal-seen:class-row-1', '1');

    expect(collectSeenResultReleaseKeys(entries)).toEqual(new Set());
  });
});

describe('useResultReveal — ?resultEntryId= deep link', () => {
  const entries = [order([dogGroup({ classes: [classRow({ id: 'row-1' })] })])];

  it('opens the reveal named by the param and strips the param', async () => {
    // Stripping matters: leaving it in place re-opens the reveal on a refresh
    // or a Back, after the exhibitor already dismissed it.
    const { result, currentUrl } = renderResultReveal(
      '/my-entries?resultEntryId=row-1&tab=upcoming',
      entries
    );

    await waitFor(() => expect(result.current.resultRevealModel?.entryId).toBe('row-1'));
    await waitFor(() => expect(currentUrl()).toBe('/my-entries?tab=upcoming'));
  });

  it('leaves unrelated params alone', async () => {
    const { currentUrl } = renderResultReveal(
      '/my-entries?waitlistOffer=offer-9&resultEntryId=row-1',
      entries
    );

    await waitFor(() => expect(currentUrl()).toBe('/my-entries?waitlistOffer=offer-9'));
  });

  it('honours a param that arrives by navigation after mount', async () => {
    // The param is not always present at mount — My Payments links here from
    // inside the app. An implementation that read the URL once on mount would
    // silently ignore that link, and every param-at-mount test would still
    // pass, so this is what pins `searchParams` as a live dependency.
    const { result, navigate } = renderResultReveal('/my-entries', entries);
    expect(result.current.resultRevealModel).toBeNull();

    act(() => navigate('/my-entries?resultEntryId=row-1'));

    await waitFor(() => expect(result.current.resultRevealModel?.entryId).toBe('row-1'));
  });

  it('keeps the param when the id resolves to nothing, then honours it once entries sync', async () => {
    // Entries replicate asynchronously, so the row the link names routinely
    // does not exist at mount. Consuming the param then would silently drop
    // the deep link; ignoring the later sync would strand it forever. Both
    // halves are asserted, because either one alone passes for the wrong code.
    const { result, currentUrl, rerender } = renderResultReveal(
      '/my-entries?resultEntryId=row-1',
      []
    );

    await waitFor(() => expect(currentUrl()).toBe('/my-entries?resultEntryId=row-1'));
    expect(result.current.resultRevealModel).toBeNull();

    rerender({ entries });

    await waitFor(() => expect(result.current.resultRevealModel?.entryId).toBe('row-1'));
    await waitFor(() => expect(currentUrl()).toBe('/my-entries'));
  });

  it('leaves a param naming a row nobody owns in place', async () => {
    const { result, currentUrl } = renderResultReveal('/my-entries?resultEntryId=ghost', entries);

    await waitFor(() => expect(currentUrl()).toBe('/my-entries?resultEntryId=ghost'));
    expect(result.current.resultRevealModel).toBeNull();
  });

  it('does not reopen a reveal the exhibitor closed', async () => {
    const { result } = renderResultReveal('/my-entries?resultEntryId=row-1', entries);

    await waitFor(() => expect(result.current.resultRevealModel).not.toBeNull());
    act(() => result.current.closeResultReveal());

    expect(result.current.resultRevealModel).toBeNull();
    // Give the effect every chance to fire again before believing it stayed shut.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.resultRevealModel).toBeNull();
  });

  it('opens the reveal a card tap hands it', async () => {
    const { result } = renderResultReveal('/my-entries', entries);
    const model = findResultRevealModel(entries, 'row-1')!;

    act(() => result.current.openResultReveal(model));

    await waitFor(() => expect(result.current.resultRevealModel).toBe(model));
  });

  it('opens nothing when no param is present', async () => {
    const { result } = renderResultReveal('/my-entries', entries);

    await waitFor(() => expect(result.current.seenResultReleaseKeys).toEqual(new Set()));
    expect(result.current.resultRevealModel).toBeNull();
  });

  it('keeps closeResultReveal stable, so the dialog group does not remount', () => {
    const { result, rerender } = renderResultReveal('/my-entries', entries);
    const before = result.current.closeResultReveal;
    rerender({ entries });

    expect(result.current.closeResultReveal).toBe(before);
    expect(result.current.markSeen).toBe(result.current.markSeen);
  });
});

describe('useResultReveal — seen markers', () => {
  const entries = [order([dogGroup({ classes: [classRow({ id: 'row-1' })] })])];
  const key = () => findResultRevealModel(entries, 'row-1')!.releaseKey;

  it('records a reveal as seen in storage and in the returned set', async () => {
    const { result } = renderResultReveal('/my-entries', entries);

    act(() => result.current.markSeen(key()));

    await waitFor(() => expect(result.current.seenResultReleaseKeys.has(key())).toBe(true));
    expect(localStorage.getItem(`myk9:result-reveal-seen:${key()}`)).toBe('1');
  });

  it('seeds the set from storage on mount', async () => {
    localStorage.setItem(`myk9:result-reveal-seen:${key()}`, '1');
    const { result } = renderResultReveal('/my-entries', entries);

    await waitFor(() => expect(result.current.seenResultReleaseKeys).toEqual(new Set([key()])));
  });

  it('re-reads storage when entries arrive later', async () => {
    // The seen set is derived from the entries, so it has to be rebuilt when
    // replication delivers them — otherwise every card on a cold boot renders
    // its reveal as unseen and re-announces results the exhibitor has read.
    localStorage.setItem(`myk9:result-reveal-seen:${key()}`, '1');
    const { result, rerender } = renderResultReveal('/my-entries', []);

    await waitFor(() => expect(result.current.seenResultReleaseKeys).toEqual(new Set()));
    rerender({ entries });

    await waitFor(() => expect(result.current.seenResultReleaseKeys).toEqual(new Set([key()])));
  });

  it('keeps the same Set when a key is marked twice', async () => {
    // The set is a prop on the memoized card list. Returning a fresh Set for a
    // no-op re-render every card on the page.
    const { result } = renderResultReveal('/my-entries', entries);
    act(() => result.current.markSeen(key()));
    await waitFor(() => expect(result.current.seenResultReleaseKeys.has(key())).toBe(true));

    const first = result.current.seenResultReleaseKeys;
    act(() => result.current.markSeen(key()));

    expect(result.current.seenResultReleaseKeys).toBe(first);
  });
});
