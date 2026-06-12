import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export type FunctionInventoryDiff = {
  deployedOnly: string[];
  repoOnly: string[];
  matched: string[];
};

export function parseSupabaseFunctionList(output: string): string[] {
  const trimmed = output.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return uniqueInOrder(
        parsed.flatMap(entry => {
          if (!entry || typeof entry !== 'object') return [];
          const record = entry as Record<string, unknown>;
          const name = record.slug ?? record.name;
          return typeof name === 'string' ? [name] : [];
        })
      );
    }
  } catch {
    // Fall through to table parsing.
  }

  if (trimmed.includes('|')) {
    return uniqueInOrder(
      trimmed
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.includes('|') && !/^[-|\s]+$/.test(line))
        .map(line => line.split('|').map(cell => cell.trim()))
        .filter(cells => !/^id$/i.test(cells[0] ?? ''))
        .map(cells => cells[2] ?? cells[1] ?? cells[0])
        .filter(name => /^[a-z0-9][a-z0-9-]*$/i.test(name))
    );
  }

  return uniqueInOrder(
    trimmed
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !/^name\s+/i.test(line))
      .map(line => line.split(/\s+/)[0])
      .filter(name => /^[a-z0-9][a-z0-9-]*$/i.test(name))
  );
}

export function diffFunctionInventory({
  deployed,
  repo,
}: {
  deployed: string[];
  repo: string[];
}): FunctionInventoryDiff {
  const deployedSet = new Set(deployed);
  const repoSet = new Set(repo);

  return {
    deployedOnly: sortedUnique(deployed.filter(name => !repoSet.has(name))),
    repoOnly: sortedUnique(repo.filter(name => !deployedSet.has(name))),
    matched: sortedUnique(repo.filter(name => deployedSet.has(name))),
  };
}

export function listRepoFunctions(functionsDir: string): string[] {
  if (!existsSync(functionsDir)) return [];

  return sortedUnique(
    readdirSync(functionsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
      .map(entry => entry.name)
  );
}

export function renderFunctionInventoryMarkdown(diff: FunctionInventoryDiff): string {
  const lines = [
    '# Edge Function Inventory',
    '',
    `- Matched: ${diff.matched.length}`,
    `- Deployed only: ${diff.deployedOnly.length}`,
    `- Repo only: ${diff.repoOnly.length}`,
    '',
  ];

  lines.push('## Deployed Only');
  lines.push(...renderList(diff.deployedOnly));
  lines.push('', '## Repo Only');
  lines.push(...renderList(diff.repoOnly));
  lines.push('', '## Matched');
  lines.push(...renderList(diff.matched));

  return `${lines.join('\n')}\n`;
}

function renderList(items: string[]): string[] {
  if (items.length === 0) return ['- None'];
  return items.map(item => `- \`${item}\``);
}

function sortedUnique(items: string[]): string[] {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}

function uniqueInOrder(items: string[]): string[] {
  return [...new Set(items)];
}

function readDeployedFunctions(): string[] {
  const outputPathArg = process.argv.find(arg => arg.startsWith('--cli-output='));
  if (outputPathArg) {
    return parseSupabaseFunctionList(readFileSync(outputPathArg.split('=')[1], 'utf8'));
  }

  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const args = projectRef
    ? ['functions', 'list', '--project-ref', projectRef]
    : ['functions', 'list'];
  const output = execFileSync('supabase', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return parseSupabaseFunctionList(output);
}

function runCli(): void {
  const deployed = readDeployedFunctions();
  const repo = listRepoFunctions(join(process.cwd(), 'supabase/functions'));
  const diff = diffFunctionInventory({ deployed, repo });

  process.stdout.write(renderFunctionInventoryMarkdown(diff));
  if (diff.deployedOnly.length > 0 || diff.repoOnly.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
