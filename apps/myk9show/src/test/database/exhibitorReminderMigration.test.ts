import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrations = resolve(__dirname, '../../../../../supabase/migrations');
const columnsAndCron = readFileSync(
  resolve(migrations, '20261117043700_myk9_2113_exhibitor_reminder_columns_and_cron.sql'),
  'utf8'
);
const history = readFileSync(
  resolve(migrations, '20261117044900_myk9_2113_reminder_email_history.sql'),
  'utf8'
);

describe('MYK9-2113 exhibitor reminder migrations', () => {
  it('adds the claim and status columns without granting them to anon or authenticated', () => {
    expect(columnsAndCron).toContain('ADD COLUMN IF NOT EXISTS reminder_email_sent_at timestamptz');
    expect(columnsAndCron).toContain("reminder_email_status text NOT NULL DEFAULT 'pending'");
    expect(columnsAndCron).not.toMatch(/\bGRANT\b/i);
    expect(columnsAndCron).toContain('REVOKE ALL (reminder_email_sent_at, reminder_email_status)');
    expect(columnsAndCron).toContain('ON public.entries FROM anon, authenticated');
    expect(columnsAndCron).toContain("'pending', 'sent', 'failed', 'covered'");
    expect(columnsAndCron).toContain("conname = 'entries_reminder_email_status_check'");
  });

  it('schedules the hourly job with the reminder scope and the existing Vault secrets', () => {
    expect(columnsAndCron).toContain("'exhibitor-reminder-emails'");
    expect(columnsAndCron).toContain("'41 * * * *'");
    expect(columnsAndCron).toContain(`body := '{"scope":"reminder"}'::jsonb`);
    for (const secret of [
      'heritage_confirmation_email_url',
      'heritage_confirmation_service_role_key',
      'heritage_confirmation_secret',
    ]) {
      expect(columnsAndCron).toContain(`name = '${secret}'`);
    }
  });

  it('lists show_reminder in the delivery history, scoped to its show through the entry trial', () => {
    expect(history).toContain("WHEN 'show_reminder' THEN 'show_reminder'");
    expect(history).toContain("log.email_type IN ('heritage_confirmation', 'show_reminder')");
    expect(history).toContain("WHEN 'show_reminder' THEN EXISTS (");
    expect(history).toContain('public.can_manage_show_lifecycle_email(p_show_id)');
    expect(history).toContain('FROM PUBLIC, anon');
  });
});
