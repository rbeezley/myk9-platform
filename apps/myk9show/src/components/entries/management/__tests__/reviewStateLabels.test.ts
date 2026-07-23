import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EntryStatus } from '@/types/show-registration-types';
import {
  BULK_COMMAND_LABELS,
  getRegistrationReviewLabel,
  getRegistrationReviewState,
  getRegistrationReviewTone,
  REGISTRATION_REVIEW_STATE_LABELS,
  STATUS_COMMAND_LABELS,
} from '../reviewStateLabels';

function registration(
  attentionReasons: string[],
  statuses: EntryStatus[]
): { attentionReasons: any[]; entries: { entryStatus: EntryStatus }[] } {
  return {
    attentionReasons,
    entries: statuses.map(entryStatus => ({ entryStatus })),
  };
}

describe('reviewStateLabels', () => {
  describe('getRegistrationReviewState / getRegistrationReviewLabel', () => {
    it('returns missing_information when the attention reason is present, regardless of entry status', () => {
      const reg = registration(['missing_information'], [EntryStatus.ACCEPTED]);
      expect(getRegistrationReviewState(reg)).toBe('missing_information');
      expect(getRegistrationReviewLabel(reg)).toBe('Missing information');
    });

    it('returns needs_review when pending_review is present and missing_information is not', () => {
      const reg = registration(['pending_review'], [EntryStatus.PENDING]);
      expect(getRegistrationReviewState(reg)).toBe('needs_review');
      expect(getRegistrationReviewLabel(reg)).toBe('Needs review');
    });

    it('prioritizes missing_information over pending_review when both are present', () => {
      const reg = registration(['pending_review', 'missing_information'], [EntryStatus.PENDING]);
      expect(getRegistrationReviewState(reg)).toBe('missing_information');
    });

    it('maps a uniform ACCEPTED status to the "Accepted" label with no attention reasons', () => {
      const reg = registration([], [EntryStatus.ACCEPTED, EntryStatus.ACCEPTED]);
      expect(getRegistrationReviewState(reg)).toBe('accepted');
      expect(getRegistrationReviewLabel(reg)).toBe('Accepted');
      expect(getRegistrationReviewTone(reg)).toBe('accepted');
    });

    it('maps REJECTED to "Not accepted"', () => {
      const reg = registration([], [EntryStatus.REJECTED]);
      expect(getRegistrationReviewLabel(reg)).toBe('Not accepted');
    });

    it('maps COMPLETED to "Complete"', () => {
      const reg = registration([], [EntryStatus.COMPLETED]);
      expect(getRegistrationReviewLabel(reg)).toBe('Complete');
    });

    it('returns "Mixed statuses" when entries have different statuses and no attention reason applies', () => {
      const reg = registration([], [EntryStatus.ACCEPTED, EntryStatus.COMPLETED]);
      expect(getRegistrationReviewState(reg)).toBe('mixed');
      expect(getRegistrationReviewLabel(reg)).toBe('Mixed statuses');
    });

    it('falls back to needs_review for an unmapped uniform status', () => {
      const reg = registration([], [EntryStatus.PENDING]);
      expect(getRegistrationReviewState(reg)).toBe('needs_review');
    });
  });

  describe('canonical vocabulary — states are nouns/adjectives', () => {
    it('never produces "Reviewed" as a state label', () => {
      const labels = Object.values(REGISTRATION_REVIEW_STATE_LABELS).map(entry => entry.label);
      expect(labels).not.toContain('Reviewed');
    });

    it('every registered state has both a label and a tone', () => {
      for (const entry of Object.values(REGISTRATION_REVIEW_STATE_LABELS)) {
        expect(entry.label.length).toBeGreaterThan(0);
        expect(['accepted', 'warning', 'destructive', 'neutral']).toContain(entry.tone);
      }
    });
  });

  describe('STATUS_COMMAND_LABELS — commands are verbs', () => {
    it('maps ACCEPTED to the verb "Accept", not the noun "Accepted"', () => {
      expect(STATUS_COMMAND_LABELS[EntryStatus.ACCEPTED]).toBe('Accept');
    });

    it('maps REJECTED to the verb "Reject", not "Rejected"', () => {
      expect(STATUS_COMMAND_LABELS[EntryStatus.REJECTED]).toBe('Reject');
    });

    it('maps MISSING_INFO to a "Mark ..." command, not the bare noun', () => {
      expect(STATUS_COMMAND_LABELS[EntryStatus.MISSING_INFO]).toBe('Mark missing information');
    });

    it('no command label equals a registered state noun label', () => {
      const stateLabels = new Set(
        Object.values(REGISTRATION_REVIEW_STATE_LABELS).map(entry => entry.label)
      );
      for (const command of Object.values(STATUS_COMMAND_LABELS)) {
        expect(stateLabels.has(command as string)).toBe(false);
      }
    });
  });

  describe('BULK_COMMAND_LABELS — grammatical bulk phrasing, not a templated suffix', () => {
    it('maps ACCEPTED/REJECTED to a trailing "all"', () => {
      expect(BULK_COMMAND_LABELS[EntryStatus.ACCEPTED]).toBe('Accept all');
      expect(BULK_COMMAND_LABELS[EntryStatus.REJECTED]).toBe('Reject all');
    });

    it('maps MISSING_INFO to grammatical phrasing, not "{command} all"', () => {
      const label = BULK_COMMAND_LABELS[EntryStatus.MISSING_INFO];
      expect(label).toBe('Mark all missing information');
      expect(label).not.toBe(`${STATUS_COMMAND_LABELS[EntryStatus.MISSING_INFO]} all`);
    });
  });

  describe('source-text pin — "Reviewed" is retired from the cockpit source', () => {
    const cockpitDir = path.resolve(__dirname, '..');
    const filesToCheck = [
      'EntryFocusedRegistration.tsx',
      'EntryRegistrationQueue.tsx',
      'EntryStatusPopover.tsx',
      'EnrollmentCard.tsx',
    ];

    it.each(filesToCheck)('%s does not contain the literal string "Reviewed"', fileName => {
      const contents = readFileSync(path.join(cockpitDir, fileName), 'utf-8');
      expect(contents).not.toContain('Reviewed');
    });
  });
});
