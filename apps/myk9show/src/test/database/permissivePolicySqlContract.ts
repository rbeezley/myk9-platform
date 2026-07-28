import { createHash } from 'node:crypto';

type PolicyDefinition = [key: string, digest: string];

export interface PolicyDefinitionSignature {
  count: number;
  digest: string;
}

function normalizePolicySql(statement: string): string {
  return statement.replace(/\s+/g, ' ').trim();
}

export function policyDefinitionDigests(source: string): PolicyDefinition[] {
  const definitions: PolicyDefinition[] = [];
  const pattern =
    /create\s+policy\s+(?:"([^"]+)"|([^\s]+))\s+on\s+(?:public\.)?([a-z_]+)[\s\S]*?;/gi;

  for (const match of source.matchAll(pattern)) {
    const name = match[1] ?? match[2];
    const table = match[3];
    const statement = match[0];
    if (!name || !table || !statement) continue;

    definitions.push([
      `${table}.${name}`,
      createHash('sha256').update(normalizePolicySql(statement)).digest('hex'),
    ]);
  }

  const statementCount = source.match(/\bcreate\s+policy\b/gi)?.length ?? 0;
  if (definitions.length !== statementCount) {
    throw new Error(`Parsed ${definitions.length} of ${statementCount} CREATE POLICY statements`);
  }

  return definitions.sort(
    ([leftKey, leftDigest], [rightKey, rightDigest]) =>
      leftKey.localeCompare(rightKey) || leftDigest.localeCompare(rightDigest)
  );
}

export function policyDefinitionSignature(source: string): PolicyDefinitionSignature {
  const definitions = policyDefinitionDigests(source);
  return {
    count: definitions.length,
    digest: createHash('sha256').update(JSON.stringify(definitions)).digest('hex'),
  };
}
