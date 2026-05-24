import { describe, expect, it } from 'vitest';
import {
  normalizeShowReminderData,
  replaceVariables,
} from '@/services/notifications/EmailService.helpers';
import type { ShowReminderData } from '@/services/notifications/EmailService.types';

function makeShowReminderData(entries: ShowReminderData['entries']): ShowReminderData {
  return {
    ownerName: 'Pat',
    dogName: 'Scout',
    showName: 'Spring Trial',
    showDate: 'May 25, 2026',
    venue: 'Fairgrounds',
    address: '100 Main St',
    checkInTime: '8:00 AM',
    entries,
  };
}

describe('normalizeShowReminderData', () => {
  it('formats valid ring values and removes missing legacy ring strings', () => {
    const data = normalizeShowReminderData(
      makeShowReminderData([
        { dogName: 'Scout', className: 'Novice Containers', ringNumber: '2' },
        { dogName: 'Roo', className: 'Advanced Interior', ringNumber: 'Ring 0' },
      ])
    );

    expect(data.entries).toEqual([
      { dogName: 'Scout', className: 'Novice Containers', ringNumber: 'Ring 2' },
      { dogName: 'Roo', className: 'Advanced Interior', ringNumber: '' },
    ]);
  });
});

describe('replaceVariables', () => {
  it('honors entry-level conditionals in show reminder loops', () => {
    const template = [
      '{{#each entries}}',
      '- {{dogName}} in {{className}}{{#if ringNumber}} ({{ringNumber}}){{/if}}',
      '{{/each}}',
    ].join('\n');
    const data = normalizeShowReminderData(
      makeShowReminderData([
        { dogName: 'Scout', className: 'Novice Containers', ringNumber: '2' },
        { dogName: 'Roo', className: 'Advanced Interior', ringNumber: '0' },
      ])
    );

    expect(replaceVariables(template, data)).toContain('- Scout in Novice Containers (Ring 2)');
    expect(replaceVariables(template, data)).toContain('- Roo in Advanced Interior\n');
    expect(replaceVariables(template, data)).not.toContain('Ring 0');
  });
});
