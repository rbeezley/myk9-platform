import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';

import { SecretaryCockpitFocusedClass } from './SecretaryCockpitFocusedClass';
import { expectedStartValue } from './focusedClassTiming';
import type { FocusedClassPinMode } from '@/components/shows/ShowDetails/showStickyLayout';
import type { FocusedClassModel, SecretaryCockpitClass } from './secretaryCockpitTypes';

/**
 * MYK9-1989: where the class header pins (from lg), it is compact so a laptop shows the entries.
 * The settings fold behind Class settings and the entries come before the In ring tile and checklist. Below lg (pinMode none) the card keeps its full layout.
 */

// The Requirements row reads the class replica; these tests do not exercise it.
vi.mock('@/features/at-show/useLiveClasses', () => ({ useLiveClasses: () => null }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'user-1', email: 'secretary@example.com', user_metadata: {} },
    hasRole: () => true,
  }),
}));
vi.mock('@/services/replication', () => ({
  replicatedPaperworkPrintsTable: { confirmPrinted: vi.fn(), voidPrint: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/features/show-workbench/workbenchAnnouncementPost', () => ({
  useWorkbenchAnnouncementPost: () => ({ postAnnouncement: vi.fn() }),
}));

const TZ = 'America/Chicago';

const focused: FocusedClassModel = {
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Container Novice',
  timeLabel: '9:00 AM',
  scheduledStart: '09:00',
  expectedStart: '9:00 AM',
  startedLabel: null,
  finishedLabel: null,
  lifecycle: { evidence: 'recorded', value: 'not-started' },
  progress: { evidence: 'computed', value: { completed: 0, total: 8 } },
  judgeName: 'Pat Donovan',
  attentionCount: 0,
  closeout: 'none',
  cardStatus: { progress: null, inRing: null, nextUp: [], nextStep: null },
  printTrackingInUse: true,
  actualStart: { evidence: 'unknown', value: null },
  actualFinish: { evidence: 'unknown', value: null },
  paperwork: [],
  entryRows: [],
  entries: [],
  entriesHidden: 0,
};

const sourceClass: SecretaryCockpitClass = {
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Container Novice',
  classOrder: 0,
  scheduledStart: '09:00',
  lifecycle: 'not-started',
  entryCount: 8,
  scoredCount: 0,
  attention: [],
  actions: [],
  paperwork: [],
  entryRows: [],
};

function renderClass(pinMode: FocusedClassPinMode, model: FocusedClassModel = focused) {
  return render(
    <SecretaryCockpitFocusedClass
      showId="show-1"
      focused={model}
      sourceClass={sourceClass}
      trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
      attention={[]}
      timeZone={TZ}
      pinMode={pinMode}
      canManageShow
      onCommand={vi.fn()}
    />
  );
}

/** True when `a` comes before `b` in the document. */
const before = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('SecretaryCockpitFocusedClass compact header (MYK9-1989)', () => {
  it('pinned, shows the values on one line and folds the settings behind Class settings', async () => {
    const { user } = renderClass('panel');
    expect(screen.getByTestId('focused-class-header')).toHaveAttribute('data-compact', 'true');

    const summary = screen.getByTestId('focused-class-summary');
    const expected = expectedStartValue(sourceClass, TZ);
    expect(expected).not.toBe('');
    expect(summary).toHaveTextContent('Not started');
    expect(summary).toHaveTextContent('Judge Pat Donovan');
    expect(summary).toHaveTextContent(`Expected ${expected}`);
    expect(screen.queryByText('Expected start')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Class settings' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Expected start')).toBeVisible();
    expect(screen.getByText('Actual timing')).toBeVisible();
    expect(screen.getByRole('button', { name: /^Status: Not started/ })).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Expected start')).not.toBeInTheDocument();
  });

  it('pinned, puts the entries before the In ring tile and the checklist', () => {
    renderClass('page');
    const entries = screen.getByRole('heading', { name: 'Entries in run order' });
    const checklist = screen.getByRole('heading', { name: 'Class checklist' });
    expect(before(entries, checklist)).toBe(true);
    expect(before(entries, screen.getByTestId('focused-class-work'))).toBe(true);
  });

  it('has no Checklist jump button: the checklist is one compact line now (MYK9-2380)', () => {
    renderClass('panel');
    expect(screen.queryByRole('button', { name: 'Checklist' })).not.toBeInTheDocument();
    expect(screen.getByTestId('class-checklist-summary')).toBeInTheDocument();
  });

  it('a newly picked class opens with its settings closed', async () => {
    const { user, rerender } = renderClass('panel');
    await user.click(screen.getByRole('button', { name: 'Class settings' }));
    expect(screen.getByText('Expected start')).toBeInTheDocument();
    rerender(
      <SecretaryCockpitFocusedClass
        showId="show-1"
        focused={{ ...focused, id: 'class-2', name: 'Interior Novice' }}
        sourceClass={{ ...sourceClass, id: 'class-2', name: 'Interior Novice' }}
        trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
        attention={[]}
        timeZone={TZ}
        pinMode="panel"
        canManageShow
        onCommand={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Class settings' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByText('Expected start')).not.toBeInTheDocument();
  });

  it('unpinned (below lg), keeps the full card: fields shown, checklist before the entries', () => {
    renderClass('none');
    expect(screen.getByTestId('focused-class-header')).not.toHaveAttribute('data-compact');
    expect(screen.queryByRole('button', { name: 'Class settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Checklist' })).not.toBeInTheDocument();
    expect(screen.getByText('Expected start')).toBeInTheDocument();
    const entries = screen.getByRole('heading', { name: 'Entries in run order' });
    const checklist = screen.getByRole('heading', { name: 'Class checklist' });
    expect(before(checklist, entries)).toBe(true);
  });
});

// MYK9-2143: beside its schedule card the header does not repeat what the card says.
describe('SecretaryCockpitFocusedClass header beside its schedule card', () => {
  function renderListed(pinMode: FocusedClassPinMode, canManageShow: boolean) {
    return render(
      <SecretaryCockpitFocusedClass
        showId="show-1"
        focused={focused}
        sourceClass={sourceClass}
        trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
        attention={[]}
        timeZone={TZ}
        pinMode={pinMode}
        cardListed
        canManageShow={canManageShow}
        onCommand={vi.fn()}
        {...(canManageShow && { judgeControl: <span>Judge picker</span> })}
      />
    );
  }

  it('pinned, keeps the status badge and drops the count, the judge and the times', async () => {
    const { user } = renderListed('panel', true);
    const summary = screen.getByTestId('focused-class-summary');
    expect(summary).toHaveTextContent(/^Not started$/);

    // The settings that hold them are still one click away.
    await user.click(screen.getByRole('button', { name: 'Class settings' }));
    expect(screen.getByText('Expected start')).toBeVisible();
    expect(screen.getByText('Judge picker')).toBeVisible();
  });

  it('unpinned, shows no facts line under the name', () => {
    renderListed('none', true);
    const header = screen.getByTestId('focused-class-header');
    expect(header).not.toHaveTextContent(/entr(y|ies)/);
    expect(header).not.toHaveTextContent('Judge Pat Donovan');
  });

  it.each(['panel', 'none'] as const)(
    'keeps the judge as a fact for a viewer with no Judge field (%s)',
    pinMode => {
      renderListed(pinMode, false);
      const header = screen.getByTestId('focused-class-header');
      expect(header).toHaveTextContent('Judge Pat Donovan');
      expect(header).not.toHaveTextContent(/entr(y|ies)/);
    }
  );
});
