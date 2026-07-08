import { describe, expect, it } from 'vitest';
import {
  buildLifecycleEmailIdempotencyKey,
  buildLifecycleEmailPreview,
  calculateLifecycleEmailDueAt,
  calculateReminderDueAt,
} from './index';

const show = {
  name: 'Heartland Scent Work Trial',
  startDate: '2026-09-15',
  endDate: '2026-09-16',
  venueName: 'County Fairgrounds',
  location: 'Ames, IA',
};

describe('lifecycle email scheduling', () => {
  it('calculates the two-week reminder in the show timezone', () => {
    const due = calculateReminderDueAt({
      showStartDate: '2026-09-15',
      timezone: 'America/Chicago',
      daysBefore: 14,
    });

    expect(due.toISOString()).toBe('2026-09-01T14:00:00.000Z');
  });

  it('calculates the day-before reminder across daylight saving time', () => {
    const due = calculateReminderDueAt({
      showStartDate: '2026-11-02',
      timezone: 'America/Chicago',
      daysBefore: 1,
    });

    expect(due.toISOString()).toBe('2026-11-01T15:00:00.000Z');
  });

  it('makes results available the morning after the show end date', () => {
    const due = calculateLifecycleEmailDueAt('results_available', {
      startDate: '2026-09-15',
      endDate: '2026-09-16',
      timezone: 'America/Chicago',
    });

    expect(due.toISOString()).toBe('2026-09-17T14:00:00.000Z');
  });
});

describe('lifecycle email rendering', () => {
  it('renders an acceptance preview with resolved entry data', () => {
    const preview = buildLifecycleEmailPreview({
      stepType: 'accepted',
      show,
      recipient: { name: 'Jamie', email: 'jamie@example.com' },
      entry: {
        dogName: 'Willow',
        className: 'Advanced Interior',
        armbandNumber: '412',
        amountDue: 15,
      },
      secretaryNote: 'Parking opens at 7:00.',
    });

    expect(preview.subject).toBe('Entry accepted - Heartland Scent Work Trial');
    expect(preview.bodyText).toContain('Your entry for Willow has been accepted');
    expect(preview.bodyText).toContain('Class: Advanced Interior');
    expect(preview.bodyText).toContain('Armband: 412');
    expect(preview.bodyText).toContain('Amount due: $15.00');
    expect(preview.html).toContain('From the show secretary');
    expect(preview.warnings).toEqual([]);
  });

  it('omits optional armband copy and warns before accepted send', () => {
    const preview = buildLifecycleEmailPreview({
      stepType: 'accepted',
      show,
      recipient: { name: 'Jamie', email: 'jamie@example.com' },
      entry: { dogName: 'Willow', className: 'Advanced Interior' },
    });

    expect(preview.bodyText).not.toContain('Armband:');
    expect(preview.warnings).toContain('Armband is not assigned yet.');
  });

  it('escapes editable subject, body, and secretary note in html output', () => {
    const preview = buildLifecycleEmailPreview({
      stepType: 'day_before_reminder',
      show,
      recipient: { name: 'Jamie', email: 'jamie@example.com' },
      subject: '<script>alert("subject")</script>',
      body: 'Bring <b>treats</b>.\n<script>alert("body")</script>',
      secretaryNote: '<img src=x onerror=alert(1)>',
    });

    expect(preview.html).toContain('&lt;script&gt;alert(&quot;subject&quot;)&lt;/script&gt;');
    expect(preview.html).toContain('Bring &lt;b&gt;treats&lt;/b&gt;');
    expect(preview.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(preview.html).not.toContain('<script>');
    expect(preview.html).not.toContain('<img src=x');
  });
});

describe('lifecycle email idempotency', () => {
  it('builds a stable idempotency key for a recipient job', () => {
    const input = {
      showId: 'show-1',
      stepType: 'two_week_reminder' as const,
      recipientScope: 'enrollment' as const,
      enrollmentId: 'enrollment-1',
      batchKey: '2026-09-01',
    };

    expect(buildLifecycleEmailIdempotencyKey(input)).toBe(buildLifecycleEmailIdempotencyKey(input));
    expect(buildLifecycleEmailIdempotencyKey(input)).toBe(
      'show-lifecycle-email:show-1:two_week_reminder:enrollment:2026-09-01:enrollment-1:original'
    );
  });

  it('distinguishes correction emails from the original job', () => {
    const original = buildLifecycleEmailIdempotencyKey({
      showId: 'show-1',
      stepType: 'accepted',
      recipientScope: 'enrollment',
      enrollmentId: 'enrollment-1',
    });
    const correction = buildLifecycleEmailIdempotencyKey({
      showId: 'show-1',
      stepType: 'accepted',
      recipientScope: 'enrollment',
      enrollmentId: 'enrollment-1',
      correctionForJobId: 'job-1',
    });

    expect(correction).not.toBe(original);
    expect(correction).toContain('correction:job-1');
  });
});
