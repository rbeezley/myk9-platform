import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export type CheckConstraint = {
  table: string;
  column: string;
  allowedValues: string[];
  source: string;
};

export type EnumWrite = {
  file: string;
  table: string;
  column: string;
  value: string;
};

export type EnumDriftFinding = {
  table: string;
  column: string;
  value: string;
  files: string[];
  allowedValues: string[];
  constraintSource: string;
};

type ExtractSourceInput = {
  path: string;
  source: string;
  trackedColumns: Map<string, Set<string>>;
};

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

export function extractCheckConstraints(sql: string): CheckConstraint[] {
  const constraints = new Map<string, CheckConstraint>();

  for (const statement of splitSqlStatements(sql)) {
    const createTable = statement.match(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?("?[\w]+"?)\s*\(([\s\S]*)\)$/i
    );

    if (createTable) {
      const table = normalizeIdentifier(createTable[1]);
      for (const definition of splitTopLevelCommas(createTable[2])) {
        const columnMatch = definition.trim().match(/^("?[\w]+"?)\s+/);
        if (!columnMatch) continue;

        const parsed = parseCheckExpression(definition);
        if (parsed) {
          constraints.set(`${table}.${parsed.column}.inline CHECK`, {
            table,
            column: parsed.column,
            allowedValues: parsed.allowedValues,
            source: 'inline CHECK',
          });
        }
      }
      continue;
    }

    const dropConstraint = statement.match(
      /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?(?:public\.)?("?[\w]+"?)\s+drop\s+constraint\s+(?:if\s+exists\s+)?("?[\w]+"?)/i
    );

    if (dropConstraint) {
      const table = normalizeIdentifier(dropConstraint[1]);
      const name = normalizeIdentifier(dropConstraint[2]);
      constraints.delete(`${table}.${name}`);
      continue;
    }

    const addConstraint = statement.match(
      /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?(?:public\.)?("?[\w]+"?)\s+add\s+constraint\s+("?[\w]+"?)\s+check\s*\(([\s\S]*)\)$/i
    );

    if (addConstraint) {
      const table = normalizeIdentifier(addConstraint[1]);
      const source = normalizeIdentifier(addConstraint[2]);
      const parsed = parseCheckExpression(addConstraint[3]);
      if (parsed) {
        constraints.set(`${table}.${source}`, {
          table,
          column: parsed.column,
          allowedValues: parsed.allowedValues,
          source,
        });
      }
    }
  }

  return [...constraints.values()].sort(compareConstraint);
}

export function extractEnumWritesFromSource({
  path,
  source,
  trackedColumns,
}: ExtractSourceInput): EnumWrite[] {
  const localObjects = collectLocalObjectLiterals(source);
  const writes: EnumWrite[] = [];
  const fromCallPattern =
    /\.from\(\s*['"]([^'"]+)['"]\s*\)([\s\S]{0,1200}?)(?=;\s|\n\s*(?:await|const|let|var|return)\b|$)/g;
  let fromMatch: RegExpExecArray | null;

  while ((fromMatch = fromCallPattern.exec(source))) {
    const table = fromMatch[1];
    const columns = trackedColumns.get(table);
    if (!columns) continue;

    const chain = fromMatch[2];
    const mutationPattern = /\.(?:insert|update|upsert)\(\s*({[\s\S]*?}|\w+)/g;
    let mutationMatch: RegExpExecArray | null;

    while ((mutationMatch = mutationPattern.exec(chain))) {
      const argument = mutationMatch[1].trim();
      const objectLiteral = argument.startsWith('{') ? argument : localObjects.get(argument);

      if (!objectLiteral) continue;

      writes.push(...extractObjectEnumWrites(path, table, objectLiteral, columns));
    }
  }

  return writes;
}

export function compareEnumWritesToChecks({
  constraints,
  writes,
}: {
  constraints: CheckConstraint[];
  writes: EnumWrite[];
}): EnumDriftFinding[] {
  const constraintsByColumn = new Map(
    constraints.map(constraint => [`${constraint.table}.${constraint.column}`, constraint])
  );
  const findingFiles = new Map<string, Set<string>>();

  for (const write of writes) {
    const constraint = constraintsByColumn.get(`${write.table}.${write.column}`);
    if (!constraint || constraint.allowedValues.includes(write.value)) continue;

    const key = `${write.table}.${write.column}.${write.value}`;
    const files = findingFiles.get(key) ?? new Set<string>();
    files.add(write.file);
    findingFiles.set(key, files);
  }

  return [...findingFiles.entries()]
    .map(([key, files]) => {
      const [table, column, value] = key.split('.');
      const constraint = constraintsByColumn.get(`${table}.${column}`);
      if (!constraint) {
        throw new Error(`Missing constraint for finding ${key}`);
      }

      return {
        table,
        column,
        value,
        files: [...files].sort(),
        allowedValues: constraint.allowedValues,
        constraintSource: constraint.source,
      };
    })
    .sort((a, b) =>
      `${a.table}.${a.column}.${a.value}`.localeCompare(`${b.table}.${b.column}.${b.value}`)
    );
}

export function buildTrackedColumns(constraints: CheckConstraint[]): Map<string, Set<string>> {
  const trackedColumns = new Map<string, Set<string>>();

  for (const constraint of constraints) {
    const columns = trackedColumns.get(constraint.table) ?? new Set<string>();
    columns.add(constraint.column);
    trackedColumns.set(constraint.table, columns);
  }

  return trackedColumns;
}

export function renderEnumDriftMarkdown(findings: EnumDriftFinding[]): string {
  if (findings.length === 0) {
    return '# Enum/CHECK Drift\n\nNo enum/CHECK drift findings.\n';
  }

  const lines = [
    '# Enum/CHECK Drift',
    '',
    '| Table | Column | App value | Constraint | Allowed values | Files |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const finding of findings) {
    lines.push(
      [
        finding.table,
        finding.column,
        `\`${finding.value}\``,
        finding.constraintSource,
        finding.allowedValues.map(value => `\`${value}\``).join(', '),
        finding.files.map(file => `\`${file}\``).join('<br>'),
      ].join(' | ')
    );
  }

  return `${lines.join('\n')}\n`;
}

export function resolveSchemaSqlPath(args: string[]): string | null {
  return args.find(arg => arg.startsWith('--schema-sql='))?.split('=')[1] ?? null;
}

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);
}

function splitTopLevelCommas(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;

    if (char === ',' && depth === 0) {
      parts.push(input.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(input.slice(start));
  return parts;
}

function parseCheckExpression(
  expression: string
): { column: string; allowedValues: string[] } | null {
  const match =
    expression.match(/("?[\w]+"?)\s+in\s*\(([\s\S]*?)\)/i) ??
    expression.match(/\(?\s*("?[\w]+"?)\s*=\s*any\s*\(\s*array\s*\[([\s\S]*?)\]\s*\)\s*\)?/i);
  if (!match) return null;

  const allowedValues = [...match[2].matchAll(/'((?:''|[^'])*)'/g)].map(valueMatch =>
    valueMatch[1].replaceAll("''", "'")
  );

  if (allowedValues.length === 0) return null;

  return {
    column: normalizeIdentifier(match[1]),
    allowedValues,
  };
}

function collectLocalObjectLiterals(source: string): Map<string, string> {
  const objects = new Map<string, string>();
  const objectPattern = /(?:const|let|var)\s+(\w+)\s*=\s*({[\s\S]*?});/g;
  let match: RegExpExecArray | null;

  while ((match = objectPattern.exec(source))) {
    objects.set(match[1], match[2]);
  }

  return objects;
}

function extractObjectEnumWrites(
  file: string,
  table: string,
  objectLiteral: string,
  columns: Set<string>
): EnumWrite[] {
  const writes: EnumWrite[] = [];
  const propertyPattern = /['"]?([A-Za-z_][\w]*)['"]?\s*:\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = propertyPattern.exec(objectLiteral))) {
    if (!columns.has(match[1])) continue;

    writes.push({
      file,
      table,
      column: match[1],
      value: match[2],
    });
  }

  return writes;
}

function compareConstraint(a: CheckConstraint, b: CheckConstraint): number {
  return `${a.table}.${a.column}.${a.source}`.localeCompare(`${b.table}.${b.column}.${b.source}`);
}

function normalizeIdentifier(identifier: string): string {
  return identifier
    .replaceAll('"', '')
    .replace(/^public\./, '')
    .toLowerCase();
}

function collectSourceFiles(root: string, directories: string[]): string[] {
  const files: string[] = [];

  for (const directory of directories) {
    walk(join(root, directory), files);
  }

  return files.filter(file => SOURCE_EXTENSIONS.has(file.slice(file.lastIndexOf('.'))));
}

function walk(path: string, files: string[]): void {
  if (!existsSync(path)) return;

  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;

    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
}

function runCli(): void {
  const root = process.cwd();
  const schemaSqlPath = resolveSchemaSqlPath(process.argv);
  const schemaSql = schemaSqlPath ? readFileSync(schemaSqlPath, 'utf8') : readMigrationSql(root);
  const constraints = extractCheckConstraints(schemaSql);
  const trackedColumns = buildTrackedColumns(constraints);
  const writes = collectSourceFiles(root, ['apps', 'packages', 'supabase/functions']).flatMap(
    file =>
      extractEnumWritesFromSource({
        path: relative(root, file),
        source: readFileSync(file, 'utf8'),
        trackedColumns,
      })
  );
  const findings = compareEnumWritesToChecks({ constraints, writes });

  process.stdout.write(renderEnumDriftMarkdown(findings));
  if (findings.length > 0) {
    process.exitCode = 1;
  }
}

function readMigrationSql(root: string): string {
  const migrationDir = join(root, 'supabase/migrations');
  return readdirSync(migrationDir)
    .filter(file => file.endsWith('.sql'))
    .sort()
    .map(file => readFileSync(join(migrationDir, file), 'utf8'))
    .join('\n\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
