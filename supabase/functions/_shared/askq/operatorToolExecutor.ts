import { readOperatorAlertSummary, type OperatorAlertClient } from './operatorAlerts.ts';
import { readOperatorHealthSummary } from './operatorHealth.ts';

export async function executeOperatorTool(
  name: string,
  _input: Record<string, unknown>,
  callerClient: OperatorAlertClient
): Promise<{ result: unknown }> {
  switch (name) {
    case 'summarize_operator_alerts':
      return { result: await readOperatorAlertSummary(callerClient) };
    case 'summarize_system_health':
      return { result: await readOperatorHealthSummary(callerClient) };
    default:
      throw new Error(`Unknown operator tool: ${name}`);
  }
}
