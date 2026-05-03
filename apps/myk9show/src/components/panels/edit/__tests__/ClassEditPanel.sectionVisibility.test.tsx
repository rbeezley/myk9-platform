/**
 * Tests for the AKC Scent Work Novice-only Section field in ClassEditPanel.
 *
 * The Section (A / B) field must:
 *   - Appear when level is Novice (or Novice A / Novice B)
 *   - Be hidden for Advanced, Excellent, and Master levels
 *   - Be hidden for the Detective element regardless of level
 *   - Be hidden for non-Scent-Work classes at any Novice level
 *     (this is enforced by the same isScentWorkNovice helper used in the panel)
 */

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { isScentWorkNovice } from '../ClassEditPanel.helpers';
import { ClassEditPanel } from '../ClassEditPanel';
import type { TrialClass } from '@/components/trials/types/trial.types';
import type { ClassData } from '@/components/classes/types/classTypes';

// ── Pure-function unit tests ────────────────────────────────────────────────

describe('isScentWorkNovice — pure function', () => {
  describe('Novice level → returns true', () => {
    it('Interior Novice', () => expect(isScentWorkNovice('Novice', 'Interior')).toBe(true));
    it('Container Novice', () => expect(isScentWorkNovice('Novice', 'Container')).toBe(true));
    it('Exterior Novice', () => expect(isScentWorkNovice('Novice', 'Exterior')).toBe(true));
    it('Buried Novice', () => expect(isScentWorkNovice('Novice', 'Buried')).toBe(true));
    it('Novice A (section suffix)', () =>
      expect(isScentWorkNovice('Novice A', 'Interior')).toBe(true));
    it('Novice B (section suffix)', () =>
      expect(isScentWorkNovice('Novice B', 'Interior')).toBe(true));
  });

  describe('Advanced level → returns false', () => {
    it('Interior Advanced', () => expect(isScentWorkNovice('Advanced', 'Interior')).toBe(false));
    it('Container Advanced', () => expect(isScentWorkNovice('Advanced', 'Container')).toBe(false));
  });

  describe('Excellent level → returns false', () => {
    it('Interior Excellent', () => expect(isScentWorkNovice('Excellent', 'Interior')).toBe(false));
    it('Container Excellent', () =>
      expect(isScentWorkNovice('Excellent', 'Container')).toBe(false));
  });

  describe('Master / Masters level → returns false', () => {
    it('Interior Master', () => expect(isScentWorkNovice('Master', 'Interior')).toBe(false));
    it('Interior Masters', () => expect(isScentWorkNovice('Masters', 'Interior')).toBe(false));
  });

  describe('Detective element → returns false regardless of level', () => {
    it('Detective Novice', () => expect(isScentWorkNovice('Novice', 'Detective')).toBe(false));
    it('Detective Advanced', () => expect(isScentWorkNovice('Advanced', 'Detective')).toBe(false));
  });
});

// ── ClassEditPanel rendering tests ──────────────────────────────────────────

// Mock stores used inside TrialClassEditForm and ClassEditForm
vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({ shows: [] }),
}));

vi.mock('@/store/userStore', () => ({
  useUserStore: () => ({ people: [] }),
}));

vi.mock('@/hooks/useClassRequirements', () => ({
  useClassRequirements: () => ({ autoFill: undefined }),
}));

// Minimal TrialClass for simple (TrialClass) mode
function makeTrialClass(level: string, element: string, section = 'A'): Partial<TrialClass> {
  return {
    id: 'cls-1',
    element,
    level,
    section,
    judgeId: 'TBD',
    judgeName: 'TBD',
    startTime: '2026-05-02T09:00',
    status: 'Upcoming',
    entries: 0,
  };
}

function renderPanel(level: string, element: string) {
  return render(
    <ClassEditPanel
      open={true}
      onClose={vi.fn()}
      classId="cls-1"
      className={`${element} ${level}`}
      initialClassData={makeTrialClass(level, element)}
    />
  );
}

describe('ClassEditPanel — Section field visibility', () => {
  it('shows Section field for Novice level', () => {
    renderPanel('Novice', 'Interior');
    expect(screen.getByLabelText('Section')).toBeInTheDocument();
  });

  it('hides Section field for Advanced level', () => {
    renderPanel('Advanced', 'Interior');
    expect(screen.queryByLabelText('Section')).not.toBeInTheDocument();
  });

  it('hides Section field for Excellent level', () => {
    renderPanel('Excellent', 'Interior');
    expect(screen.queryByLabelText('Section')).not.toBeInTheDocument();
  });

  it('hides Section field for Master level', () => {
    renderPanel('Master', 'Interior');
    expect(screen.queryByLabelText('Section')).not.toBeInTheDocument();
  });

  it('hides Section field for Detective element even at Novice level', () => {
    renderPanel('Novice', 'Detective');
    expect(screen.queryByLabelText('Section')).not.toBeInTheDocument();
  });

  it('still shows Element and Level fields for all levels', () => {
    renderPanel('Advanced', 'Interior');
    expect(screen.getByLabelText('Element')).toBeInTheDocument();
    expect(screen.getByLabelText('Level')).toBeInTheDocument();
  });
});

// ── ClassEditForm (full / ClassData mode) rendering tests ───────────────────
// Full mode is triggered when initialClassData has `estimatedJudgingTime`.

function makeClassData(level: string, element: string, section = 'A'): Partial<ClassData> {
  return {
    id: 'cls-1',
    trialId: 'trial-1',
    trial: 'Trial',
    trialDate: '2026-05-02',
    trialNumber: '1',
    classOrder: '1',
    status: 'Scheduled',
    judge: 'TBD',
    element,
    level,
    section,
    estimatedJudgingTime: '00:02', // presence of this field triggers full mode
  };
}

function renderFullPanel(level: string, element: string) {
  return render(
    <ClassEditPanel
      open={true}
      onClose={vi.fn()}
      classId="cls-1"
      className={`${element} ${level}`}
      initialClassData={makeClassData(level, element)}
    />
  );
}

describe('ClassEditForm (full mode) — Section field visibility', () => {
  it('shows Section field for Novice level', () => {
    renderFullPanel('Novice', 'Interior');
    expect(screen.getByLabelText('Section')).toBeInTheDocument();
  });

  it('hides Section field for Advanced level', () => {
    renderFullPanel('Advanced', 'Interior');
    expect(screen.queryByLabelText('Section')).not.toBeInTheDocument();
  });

  it('hides Section field for Excellent level', () => {
    renderFullPanel('Excellent', 'Interior');
    expect(screen.queryByLabelText('Section')).not.toBeInTheDocument();
  });
});
