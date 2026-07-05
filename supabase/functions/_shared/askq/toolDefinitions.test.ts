import { describe, expect, it } from 'vitest';
import { TOOLS } from './toolDefinitions.ts';

describe('AskQ tool definitions', () => {
  it('does not advertise document-search tools for bundled guide and rulebook context', () => {
    const toolNames = TOOLS.map(tool => tool.name);

    expect(toolNames).not.toContain('search_rules');
    expect(toolNames).not.toContain('search_user_guide');
    expect(toolNames).toEqual([
      'get_class_summary',
      'get_entry_results',
      'get_trial_overview',
      'search_entries',
    ]);
  });
});
