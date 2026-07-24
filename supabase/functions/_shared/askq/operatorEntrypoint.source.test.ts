import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), '../../supabase/functions/ask-operator-support/index.ts'),
  'utf8'
);
const normalAskQSource = readFileSync(
  resolve(process.cwd(), '../../supabase/functions/ask-myk9show/index.ts'),
  'utf8'
);

describe('ask-operator-support entrypoint wiring', () => {
  it('constructs operator reads from the caller JWT and isolates service role to audit', () => {
    expect(source).toContain('const callerClient = createClient(supabaseUrl, anonKey');
    expect(source).toContain('Authorization: authorization');
    expect(source).toContain('const auditClient = createClient(supabaseUrl, serviceRoleKey)');
    expect(source).toContain('callerClient,');
    expect(source).toContain('audit: createOperatorSupportAudit(auditClient)');
    expect(source).toContain('executeTool: executeOperatorTool');
    expect(source).not.toContain('executeOperatorTool(auditClient');
    expect(source).not.toContain('callerClient: auditClient');
  });

  it('keeps operator tools out of the normal AskQ endpoint', () => {
    expect(normalAskQSource).not.toContain('OPERATOR_TOOLS');
    expect(normalAskQSource).not.toContain('summarize_operator_alerts');
    expect(normalAskQSource).not.toContain('executeOperatorTool');
  });
});
