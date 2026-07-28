import type { PolicyCommand, PolicyRoleClass } from './permissivePolicyConsolidationConfig';

type PolicyRole = 'public' | 'authenticated';

export interface Policy {
  name: string;
  role: PolicyRole;
  command: PolicyCommand;
  using: string[];
  check: string[];
}

export function policy(
  name: string,
  role: PolicyRole,
  command: PolicyCommand,
  usingAtoms: string[] = [],
  checkAtoms: string[] = usingAtoms
): Policy {
  return { name, role, command, using: usingAtoms, check: checkAtoms };
}

export function select(name: string, role: PolicyRole, atoms: string[]): Policy {
  return policy(name, role, 'SELECT', atoms, []);
}

export function insert(name: string, role: PolicyRole, atoms: string[]): Policy {
  return policy(name, role, 'INSERT', [], atoms);
}

export function update(name: string, role: PolicyRole, atoms: string[], check = atoms): Policy {
  return policy(name, role, 'UPDATE', atoms, check);
}

export function remove(name: string, role: PolicyRole, atoms: string[]): Policy {
  return policy(name, role, 'DELETE', atoms, []);
}

export function manage(name: string, role: PolicyRole, atoms: string[]): Policy {
  return policy(name, role, 'ALL', atoms, atoms);
}

export function splitManage(prefix: string, role: PolicyRole, atoms: string[]): Policy[] {
  return [
    insert(`${prefix}_insert`, role, atoms),
    update(`${prefix}_update`, role, atoms),
    remove(`${prefix}_delete`, role, atoms),
  ];
}

export function splitNames(prefix: string): string[] {
  return [`${prefix}_insert`, `${prefix}_update`, `${prefix}_delete`];
}

export function applies(
  policyValue: Policy,
  role: PolicyRoleClass,
  command: Exclude<PolicyCommand, 'ALL'>
): boolean {
  return (
    (policyValue.role === 'public' || role === 'authenticated') &&
    (policyValue.command === 'ALL' || policyValue.command === command)
  );
}

export function allowed(
  policies: Policy[],
  role: PolicyRoleClass,
  command: Exclude<PolicyCommand, 'ALL'>,
  path: 'using' | 'check',
  assignment: Record<string, boolean>
): boolean {
  return policies
    .filter(policyValue => applies(policyValue, role, command))
    .some(policyValue =>
      policyValue[path].some(atom => atom === 'TRUE' || assignment[atom] === true)
    );
}

export function assignments(atoms: string[]): Record<string, boolean>[] {
  const variables = atoms.filter(atom => atom !== 'TRUE');
  return Array.from({ length: 2 ** variables.length }, (_, mask) =>
    Object.fromEntries(variables.map((atom, index) => [atom, Boolean(mask & (1 << index))]))
  );
}
