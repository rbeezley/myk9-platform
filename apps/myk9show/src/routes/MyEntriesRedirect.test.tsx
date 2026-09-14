import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { MyEntriesRedirect } from './MyEntriesRedirect';

function LocationProbe() {
  const { pathname, search, hash } = useLocation();
  return <div data-testid="location">{`${pathname}${search}${hash}`}</div>;
}

function landingFor(entry: string): string {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/my-entries" element={<MyEntriesRedirect />} />
        <Route path="/exhibitor/entries" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
  return screen.getByTestId('location').textContent ?? '';
}

describe('MyEntriesRedirect', () => {
  it('sends a bare /my-entries to the canonical path', () => {
    expect(landingFor('/my-entries')).toBe('/exhibitor/entries');
  });

  // The whole point of the component. A bare <Navigate> passes the test above
  // and fails every one of these, which is how the deep links were lost.
  it.each([
    ['/my-entries?resultEntryId=row-1', '/exhibitor/entries?resultEntryId=row-1'],
    ['/my-entries?waitlistOffer=offer-9', '/exhibitor/entries?waitlistOffer=offer-9'],
    [
      '/my-entries?resultEntryId=row-1&tab=upcoming#section',
      '/exhibitor/entries?resultEntryId=row-1&tab=upcoming#section',
    ],
    ['/my-entries#section', '/exhibitor/entries#section'],
  ])('carries the query and hash of %s across', (entry, expected) => {
    expect(landingFor(entry)).toBe(expected);
  });
});
