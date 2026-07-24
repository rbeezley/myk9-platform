import type { ToolDefinition } from './types.ts';

export const OPERATOR_TOOLS: ToolDefinition[] = [
  {
    name: 'summarize_operator_alerts',
    description:
      'Read a bounded summary of unresolved platform operator alerts. This tool cannot resolve or modify alerts.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

export function isRegisteredOperatorTool(name: string): boolean {
  return OPERATOR_TOOLS.some(tool => tool.name === name);
}
