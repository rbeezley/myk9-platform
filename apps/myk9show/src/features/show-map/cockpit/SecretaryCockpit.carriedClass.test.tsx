import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { SecretaryCockpit } from './SecretaryCockpit';
import type { SecretaryCockpitClass, SecretaryCockpitSnapshot } from './secretaryCockpitTypes';

const classOf = (id: string, name: string, classOrder: number): SecretaryCockpitClass => ({
  id,
  trialId: 'trial-1',
  name,
  classOrder,
  lifecycle: 'not-started',
  entryCount: 4,
  scoredCount: 0,
  actions: [],
  paperwork: [],
  entryRows: [],
  attention: [],
});

const snapshot: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  printTrackingInUse: true,
  checklistInUse: true,
  trials: [
    { id: 'trial-1', date: '2026-07-20', number: '1', order: 0 },
    { id: 'trial-2', date: '2026-07-21', number: '2', order: 1 },
  ],
  classes: [
    classOf('class-1', 'Container Novice', 0),
    classOf('class-2', 'Handler Discrimination Advanced', 1),
    { ...classOf('class-3', 'Interior Excellent', 0), trialId: 'trial-2' },
  ],
};

const renderAt = (search: string) =>
  render(<SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />, {
    initialRoute: `/shows/show-1${search}`,
  });

describe('SecretaryCockpit carried class (MYK9-1996)', () => {
  it('opens on a carried class the schedule has', () => {
    renderAt('?focus=class-2');

    expect(document.querySelector('[aria-pressed="true"]')).toHaveTextContent(
      'Handler Discrimination Advanced'
    );
    expect(screen.queryByTestId('carried-class-notice')).not.toBeInTheDocument();
  });

  it('names a carried class that is out of scope and selects no other class', () => {
    renderAt('?day=2026-07-21&focus=class-2');

    expect(screen.getByTestId('carried-class-notice')).toHaveTextContent(
      "Handler Discrimination Advanced isn't shown here. Pick a class."
    );
    expect(document.querySelector('[aria-pressed="true"]')).toBeNull();
  });

  it('says so for an id that is not a class of the show', () => {
    renderAt('?focus=class-gone');

    expect(screen.getByTestId('carried-class-notice')).toHaveTextContent(
      "That class isn't shown here. Pick a class."
    );
    expect(document.querySelector('[aria-pressed="true"]')).toBeNull();
  });

  it('keeps the default class when none is carried', () => {
    renderAt('');

    expect(document.querySelector('[aria-pressed="true"]')).toHaveTextContent('Container Novice');
    expect(screen.queryByTestId('carried-class-notice')).not.toBeInTheDocument();
  });
});
