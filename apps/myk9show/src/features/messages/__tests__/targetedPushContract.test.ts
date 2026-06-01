import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../../..');
const handlerPath = resolve(
  repoRoot,
  'supabase/functions/send-targeted-message/targeted-message-handler.ts'
);
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260601161000_add_show_message_push_alert.sql'
);

describe('targeted message push contract', () => {
  it('adds an explicit push_alert flag to show messages', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('add column if not exists push_alert boolean not null default true');
  });

  it('writes push_alert from send_push when creating targeted message rows', () => {
    const source = readFileSync(handlerPath, 'utf8');

    expect(source).toContain('send_push?: boolean');
    expect(source).toContain('const sendPush = payload.send_push === true;');
    expect(source).toContain('push_alert: sendPush');
  });

  it('keeps push_alert immutable for ordinary message read updates', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain(
      'create or replace function public.restrict_message_update_columns()'
    );
    expect(migration).toContain('or new.push_alert is distinct from old.push_alert');
    expect(migration).toContain("raise exception 'Only read_at may be updated on show_messages'");
  });

  it('skips chat push when push_alert is false', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('if new.push_alert is false then');
    expect(migration).toContain('return new;');
  });

  it('skips passcode push fanout when send_push is false', () => {
    const source = readFileSync(handlerPath, 'utf8');

    expect(source).toContain('const ringsideTargets = sendPush');
    expect(source).toContain(': [];');
  });
});
