import { describe, expect, it } from 'vitest';

import type { AdminMcpConfig } from '../config';
import type { AdminSupabaseClient } from '../db/supabaseAdmin';
import { diagnoseConfirmationEmail } from '../diagnostics/emailDiagnostics';
import type { ToolContext } from '../tools/index';

const CONFIG: AdminMcpConfig = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseServiceRoleKey: 'service-role-key',
  appBaseUrl: 'https://app.myk9show.com',
  envLabel: 'staging',
  defaultLimit: 25,
  maxLimit: 50,
};

const ENTRY_ID = '11111111-1111-4111-8111-111111111111';

type QueryResult = { data: unknown; error: unknown };

/** One canned response per table; `entries` via maybeSingle, `email_log` via await. */
function makeCtx(spec: { entries?: QueryResult; email_log?: QueryResult }): ToolContext {
  const supabase = {
    from(table: string) {
      const result =
        (spec as Record<string, QueryResult | undefined>)[table] ?? {
          data: null,
          error: null,
        };
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.or = chain;
      builder.returns = chain;
      builder.maybeSingle = () => Promise.resolve(result);
      builder.then = (
        resolve: (value: QueryResult) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(resolve, reject);
      return builder;
    },
  };
  return { config: CONFIG, supabase: supabase as unknown as AdminSupabaseClient };
}

function entry(overrides: Record<string, unknown>) {
  return {
    id: ENTRY_ID,
    show_id: 'show-1',
    confirmation_email_sent_at: null,
    confirmation_email_message_id: null,
    confirmation_email_status: 'pending',
    ...overrides,
  };
}

describe('diagnoseConfirmationEmail', () => {
  it('returns not_found when the entry is missing', async () => {
    const ctx = makeCtx({ entries: { data: null, error: null } });
    expect((await diagnoseConfirmationEmail({ entryId: ENTRY_ID }, ctx)).state).toBe(
      'not_found',
    );
  });

  it('returns source_unavailable when the entry query errors', async () => {
    const ctx = makeCtx({ entries: { data: null, error: { code: 'PGRST' } } });
    expect((await diagnoseConfirmationEmail({ entryId: ENTRY_ID }, ctx)).state).toBe(
      'source_unavailable',
    );
  });

  it('returns source_unavailable on email-log failure, without claiming the email failed', async () => {
    const ctx = makeCtx({
      entries: {
        data: entry({
          confirmation_email_status: 'sent',
          confirmation_email_sent_at: '2026-06-01T00:00:00Z',
        }),
        error: null,
      },
      email_log: { data: null, error: { code: 'PGRST' } },
    });
    const result = await diagnoseConfirmationEmail({ entryId: ENTRY_ID }, ctx);
    expect(result.state).toBe('source_unavailable');
    expect(JSON.stringify(result.summary)).not.toContain('failed');
  });

  it('returns found with masked email-log evidence when status is sent', async () => {
    const ctx = makeCtx({
      entries: {
        data: entry({
          confirmation_email_status: 'sent',
          confirmation_email_sent_at: '2026-06-01T00:00:00Z',
          confirmation_email_message_id: 're_abc123def456',
        }),
        error: null,
      },
      email_log: {
        data: [
          {
            status: 'delivered',
            error_message: null,
            created_at: '2026-06-01T00:00:00Z',
            status_updated_at: null,
            resend_message_id: 're_abc123def456',
            recipient_email: 'pat@example.com',
          },
        ],
        error: null,
      },
    });
    const result = await diagnoseConfirmationEmail({ entryId: ENTRY_ID }, ctx);
    expect(result.state).toBe('found');
    expect(result.summary).toMatchObject({ emailStatus: 'sent', emailLogStatus: 'delivered' });
    const evidence = JSON.stringify(result.evidence);
    expect(evidence).toContain('p***@example.com');
    expect(evidence).not.toContain('pat@example.com');
    // Task 6: email-log timestamp + shortened resend id must be in evidence.
    expect(evidence).toContain('email_log.created_at');
    expect(evidence).toContain('re_…f456');
    expect(evidence).not.toContain('re_abc123def456');
  });

  it('flags "marked sent but no email-log row"', async () => {
    const ctx = makeCtx({
      entries: {
        data: entry({
          confirmation_email_status: 'sent',
          confirmation_email_sent_at: '2026-06-01T00:00:00Z',
        }),
        error: null,
      },
      email_log: { data: [], error: null },
    });
    const result = await diagnoseConfirmationEmail({ entryId: ENTRY_ID }, ctx);
    expect(result.state).toBe('found');
    expect(result.limitations.join(' ')).toContain('No email-log row');
    expect(String((result.summary as { assessment?: string }).assessment)).toContain(
      'no matching email-log row',
    );
  });

  it('reports failure when the status is failed', async () => {
    const ctx = makeCtx({
      entries: {
        data: entry({
          confirmation_email_status: 'failed',
          confirmation_email_message_id: 're_x1y2z3a4',
          confirmation_email_sent_at: '2026-06-01T00:00:00Z',
        }),
        error: null,
      },
      email_log: {
        data: [
          {
            status: 'bounced',
            error_message: 'mailbox full',
            created_at: '2026-06-01T00:00:00Z',
            status_updated_at: null,
            resend_message_id: 're_x1y2z3a4',
            recipient_email: 'a@b.com',
          },
        ],
        error: null,
      },
    });
    const result = await diagnoseConfirmationEmail({ entryId: ENTRY_ID }, ctx);
    expect(result.state).toBe('found');
    expect(String((result.summary as { assessment?: string }).assessment)).toContain(
      'failed',
    );
  });

  it('returns insufficient_data when nothing has been sent', async () => {
    const ctx = makeCtx({
      entries: { data: entry({}), error: null },
      email_log: { data: [], error: null },
    });
    expect((await diagnoseConfirmationEmail({ entryId: ENTRY_ID }, ctx)).state).toBe(
      'insufficient_data',
    );
  });
});
