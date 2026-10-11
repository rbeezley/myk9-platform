// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { TOOLS } from './toolDefinitions.ts';
import { executeTool } from './toolExecutor.ts';

/** Records every `.eq(column, value)` the entry tools apply. */
function recordingClient() {
  const eqCalls: Array<[string, unknown]> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'ilike', 'in', 'lte', 'not', 'is', 'order', 'limit']) {
    builder[method] = () => builder;
  }
  builder.eq = (column: string, value: unknown) => {
    eqCalls.push([column, value]);
    return builder;
  };
  builder.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled);
  return {
    client: { from: () => builder, rpc: () => Promise.resolve({ data: [], error: null }) },
    eqCalls,
  };
}

describe('AskQ result_status filter covers disqualified (MYK9-1011)', () => {
  it('advertises disqualified in every result_status enum', () => {
    const enums = TOOLS.flatMap(tool => {
      const properties = (tool.input_schema as { properties?: Record<string, { enum?: string[] }> })
        .properties;
      return properties?.result_status?.enum ? [properties.result_status.enum] : [];
    });
    expect(enums.length).toBeGreaterThan(0);
    for (const values of enums) expect(values).toContain('disqualified');
  });

  it('get_entry_results filters result_status = disqualified', async () => {
    const { client, eqCalls } = recordingClient();
    await executeTool(
      'get_entry_results',
      { result_status: 'disqualified' },
      client as never,
      '',
      undefined,
      undefined,
      { showId: '00000000-0000-0000-0000-0000000000a1' } as never
    );
    expect(eqCalls).toContainEqual(['result_status', 'disqualified']);
  });
});
