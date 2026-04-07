/**
 * AKC Scent Work XML formatter — stub implementation.
 *
 * The AKC XML schema for scent work electronic submission has not yet been
 * provided. This formatter returns a minimal valid XML envelope so the
 * infrastructure can be exercised end-to-end today.
 *
 * TODO: Replace the formatXml body once AKC provides the official schema.
 */

import type { ResultFormatter, SubmissionData } from '../types';

export const AKCScentWorkFormatter: ResultFormatter = {
  organization: 'AKC',
  sportType: 'scent_work',

  formatXml(data: SubmissionData): string {
    // TODO: AKC XML schema to be provided by user.
    // Placeholder returns a minimal valid XML envelope with identity metadata
    // so secretaries can see what will eventually be submitted.
    const showName = escapeXml(data.show.name);
    const trialDate = data.trial.date ?? '';
    const entryCount = data.entries.length;

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<AKCResults>',
      '  <!-- AKC Scent Work electronic submission — schema pending -->',
      `  <!-- Show: ${showName} | Trial: ${data.trial.trialNumber} | Date: ${trialDate} | Entries: ${entryCount} -->`,
      '  <Metadata>',
      `    <Organization>AKC</Organization>`,
      `    <SportType>scent_work</SportType>`,
      `    <ShowName>${showName}</ShowName>`,
      `    <TrialNumber>${escapeXml(String(data.trial.trialNumber))}</TrialNumber>`,
      `    <TrialDate>${escapeXml(trialDate)}</TrialDate>`,
      `    <EntryCount>${entryCount}</EntryCount>`,
      '  </Metadata>',
      '</AKCResults>',
    ].join('\n');
  },
};

/** Escape the five predefined XML entities. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
