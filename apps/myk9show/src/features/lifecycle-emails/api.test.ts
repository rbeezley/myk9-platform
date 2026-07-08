import { describe, expect, it } from 'vitest';
import {
  fetchShowLifecycleEmailSummary,
  updateLifecycleEmailStepEnabled,
  type LifecycleEmailSupabaseClient,
} from './api';

function createClient(tables: Record<string, unknown[]>): {
  client: LifecycleEmailSupabaseClient;
  calls: Array<{ table: string; action: string; values?: Record<string, unknown> }>;
} {
  const calls: Array<{ table: string; action: string; values?: Record<string, unknown> }> = [];
  const client: LifecycleEmailSupabaseClient = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const builder = {
        select(columns: string) {
          calls.push({ table, action: `select:${columns}` });
          return builder;
        },
        eq(column: string, value: unknown) {
          rows = rows.filter(row => (row as Record<string, unknown>)[column] === value);
          return builder;
        },
        in(column: string, values: readonly unknown[]) {
          rows = rows.filter(row => values.includes((row as Record<string, unknown>)[column]));
          return builder;
        },
        update(values: Record<string, unknown>) {
          calls.push({ table, action: 'update', values });
          return builder;
        },
        then(resolve: (value: { data: unknown[]; error: null }) => void) {
          resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  };
  return { client, calls };
}

describe('lifecycle email api helpers', () => {
  it('loads summary rows without recipient preview detail', async () => {
    const { client, calls } = createClient({
      show_lifecycle_email_steps: [
        { show_id: 'show-1', step_type: 'two_week_reminder', is_enabled: true },
      ],
      show_lifecycle_email_jobs: [
        {
          show_id: 'show-1',
          step_type: 'two_week_reminder',
          status: 'ready',
          preview_warnings: ['No armband'],
        },
      ],
      email_log: [
        {
          related_id: 'reg-1',
          email_type: 'registration_confirmation',
          status: 'sent',
          error_message: null,
          created_at: '2026-07-08T12:00:00Z',
        },
      ],
    });

    const summary = await fetchShowLifecycleEmailSummary({
      supabase: client,
      showId: 'show-1',
      receiptSources: [{ registrationId: 'reg-1', paymentMethod: 'online' }],
    });

    expect(summary.steps.find(step => step.stepType === 'two_week_reminder')).toMatchObject({
      readyCount: 1,
      warningCount: 1,
    });
    expect(summary.receipts.sentCount).toBe(1);
    expect(calls).toEqual(
      expect.arrayContaining([
        {
          table: 'show_lifecycle_email_jobs',
          action: 'select:step_type, status, preview_warnings',
        },
      ])
    );
  });

  it('updates a step enabled setting by show and step type', async () => {
    const { client, calls } = createClient({ show_lifecycle_email_steps: [] });

    await updateLifecycleEmailStepEnabled({
      supabase: client,
      showId: 'show-1',
      stepType: 'day_before_reminder',
      isEnabled: false,
    });

    expect(calls).toContainEqual({
      table: 'show_lifecycle_email_steps',
      action: 'update',
      values: { is_enabled: false },
    });
  });
});
