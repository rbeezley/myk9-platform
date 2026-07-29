import type { LoadScenario, LoadWorkloadKind } from './loadScenario';

export interface LoadSessionAssignment {
  kind: LoadWorkloadKind;
  index: number;
  sequence: number;
}

export function buildSessionAssignments(
  scenario: LoadScenario,
  smoke = false
): LoadSessionAssignment[] {
  const assignments: LoadSessionAssignment[] = [];
  for (const workload of scenario.workloads) {
    const sessions = smoke ? 1 : workload.sessions;
    for (let index = 0; index < sessions; index += 1) {
      assignments.push({ kind: workload.kind, index, sequence: assignments.length });
    }
  }
  return assignments;
}
