import type { LifecycleEmailStepType } from './types';

export interface LifecycleEmailShowContext {
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  venueName?: string | null;
}

export interface LifecycleEmailRecipientContext {
  name?: string | null;
  email?: string | null;
}

export interface LifecycleEmailEntryContext {
  dogName?: string | null;
  className?: string | null;
  armbandNumber?: string | null;
  paymentStatus?: string | null;
  amountDue?: number | null;
}

export interface LifecycleEmailPreviewInput {
  stepType: LifecycleEmailStepType;
  show: LifecycleEmailShowContext;
  recipient: LifecycleEmailRecipientContext;
  entry?: LifecycleEmailEntryContext | null;
  subject?: string | null;
  body?: string | null;
  secretaryNote?: string | null;
  scheduleSummary?: string | null;
  resultsUrl?: string | null;
}

export interface LifecycleDecisionCorrectionDraftInput {
  showName: string;
  recipientName?: string | null;
  dogName?: string | null;
  previousDecision: 'accepted' | 'waitlisted';
  currentDecisionLabel: string;
}

export interface LifecycleEmailPreview {
  subject: string;
  bodyText: string;
  secretaryNote: string;
  html: string;
  warnings: string[];
}

export function buildLifecycleEmailPreview(
  input: LifecycleEmailPreviewInput
): LifecycleEmailPreview {
  const draft = buildLifecycleEmailDraft(input);
  const subject = cleanText(input.subject) || draft.subject;
  const bodyText = cleanText(input.body) || draft.body;
  const secretaryNote = cleanText(input.secretaryNote) ?? '';
  const warnings = buildWarnings(input);
  const noteHtml = secretaryNote
    ? `<div style="background-color:#eff6ff;border-left:4px solid #3b82f6;border-radius:6px;padding:16px;margin-top:18px;"><p style="margin:0 0 4px;font-weight:600;color:#1e40af;">From the show secretary</p>${textToHtml(secretaryNote)}</div>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f3f4f6;color:#1f2937;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:#fff;border-radius:8px;overflow:hidden;">
      <div style="background:#1f2937;padding:20px 24px;">
        <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">myK9Show</p>
      </div>
      <div style="padding:28px 24px;">
        <h1 style="margin:0 0 16px;font-size:22px;color:#111827;">${escapeHtml(subject)}</h1>
        ${textToHtml(bodyText)}
        ${noteHtml}
      </div>
    </div>
  </div>
</body>
</html>`;

  return {
    subject,
    bodyText,
    secretaryNote,
    html,
    warnings,
  };
}

export function buildLifecycleEmailDraft(input: LifecycleEmailPreviewInput): {
  subject: string;
  body: string;
} {
  const showName = input.show.name || 'the show';
  const greeting = `Hi ${input.recipient.name?.trim() || 'there'},`;
  const showLine = buildShowLine(input.show);

  switch (input.stepType) {
    case 'accepted':
      return {
        subject: `Entry accepted - ${showName}`,
        body: joinLines([
          greeting,
          '',
          `Your entry${input.entry?.dogName ? ` for ${input.entry.dogName}` : ''} has been accepted for ${showName}.`,
          input.entry?.className ? `Class: ${input.entry.className}` : null,
          input.entry?.armbandNumber ? `Armband: ${input.entry.armbandNumber}` : null,
          input.entry?.amountDue && input.entry.amountDue > 0
            ? `Amount due: $${input.entry.amountDue.toFixed(2)}`
            : null,
          showLine,
          '',
          'Thank you, and we will see you at the show.',
        ]),
      };
    case 'waitlisted':
      return {
        subject: `Entry waitlisted - ${showName}`,
        body: joinLines([
          greeting,
          '',
          `Your entry${input.entry?.dogName ? ` for ${input.entry.dogName}` : ''} is on the waitlist for ${showName}.`,
          input.entry?.className ? `Class: ${input.entry.className}` : null,
          'We will let you know if a spot opens.',
          showLine,
        ]),
      };
    case 'two_week_reminder':
      return {
        subject: `${showName} is two weeks away`,
        body: joinLines([
          greeting,
          '',
          `${showName} is coming up in two weeks.`,
          showLine,
          input.scheduleSummary,
          'Please check your entry details and watch for any updates from the show secretary.',
        ]),
      };
    case 'day_before_reminder':
      return {
        subject: `${showName} is tomorrow`,
        body: joinLines([
          greeting,
          '',
          `${showName} is tomorrow.`,
          showLine,
          input.scheduleSummary,
          'Please bring what you need for check-in and watch for any show-day updates.',
        ]),
      };
    case 'results_available':
      return {
        subject: `Results available - ${showName}`,
        body: joinLines([
          greeting,
          '',
          `Results for ${showName} are available.`,
          input.resultsUrl ? `View results: ${input.resultsUrl}` : null,
          'Please contact the show secretary with questions.',
        ]),
      };
  }
}

export function buildLifecycleDecisionCorrectionDraft(
  input: LifecycleDecisionCorrectionDraftInput
): {
  subject: string;
  body: string;
} {
  const showName = input.showName || 'the show';
  const dogName = input.dogName?.trim();
  const entryLabel = dogName ? `your entry for ${dogName}` : 'your entry';
  const greeting = `Hi ${input.recipientName?.trim() || 'there'},`;
  const previousLabel = input.previousDecision === 'accepted' ? 'accepted' : 'waitlisted';

  return {
    subject: `Correction for ${dogName || 'your entry'} - ${showName}`,
    body: joinLines([
      greeting,
      '',
      `Please disregard the earlier ${previousLabel} email for ${entryLabel} at ${showName}.`,
      `The current decision for ${entryLabel} is: ${input.currentDecisionLabel}.`,
      '',
      'We are sorry for the confusion. Please contact the show secretary with any questions.',
    ]),
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function textToHtml(value: string): string {
  return value
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
    .map(
      paragraph =>
        `<p style="margin:0 0 12px;line-height:1.6;">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`
    )
    .join('');
}

function buildWarnings(input: LifecycleEmailPreviewInput): string[] {
  const warnings: string[] = [];
  if (!input.recipient.email) warnings.push('Recipient email is missing.');
  if (
    (input.stepType === 'accepted' || input.stepType === 'waitlisted') &&
    !input.entry?.className
  ) {
    warnings.push('Class detail is missing.');
  }
  if (input.stepType === 'accepted' && !input.entry?.armbandNumber) {
    warnings.push('Armband is not assigned yet.');
  }
  if (input.stepType === 'results_available' && !input.resultsUrl) {
    warnings.push('Results link is not available yet.');
  }
  return warnings;
}

function buildShowLine(show: LifecycleEmailShowContext): string | null {
  const parts = [
    formatDateRange(show.startDate, show.endDate),
    [show.venueName, show.location]
      .map(value => value?.trim())
      .filter(Boolean)
      .join(', '),
  ].filter(Boolean);
  return parts.length ? parts.join(' - ') : null;
}

function formatDateRange(startDate?: string | null, endDate?: string | null): string | null {
  if (!startDate) return null;
  if (!endDate || endDate === startDate) return startDate;
  return `${startDate} to ${endDate}`;
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function joinLines(lines: Array<string | null | undefined>): string {
  return lines.filter(line => line !== null && line !== undefined).join('\n');
}
