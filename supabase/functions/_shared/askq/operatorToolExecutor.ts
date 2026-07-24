import { readOperatorAlertSummary, type OperatorAlertClient } from './operatorAlerts.ts';

export async function executeOperatorTool(
  name: string,
  _input: Record<string, unknown>,
  callerClient: OperatorAlertClient
): Promise<{ result: unknown }> {
  switch (name) {
    case 'summarize_operator_alerts':
      return { result: await readOperatorAlertSummary(callerClient) };
    default:
      throw new Error(`Unknown operator tool: ${name}`);
  }
}
