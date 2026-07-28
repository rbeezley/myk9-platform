const TYPE_STARTS = new Set([
  'bigint',
  'bigserial',
  'bit',
  'boolean',
  'box',
  'bytea',
  'character',
  'cidr',
  'circle',
  'date',
  'double',
  'inet',
  'integer',
  'interval',
  'json',
  'jsonb',
  'line',
  'lseg',
  'macaddr',
  'money',
  'numeric',
  'path',
  'point',
  'polygon',
  'real',
  'record',
  'serial',
  'smallint',
  'smallserial',
  'text',
  'time',
  'timestamp',
  'trigger',
  'tsquery',
  'tsvector',
  'uuid',
  'varbit',
  'varchar',
  'xml',
]);

function stripNonStatements(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/(\$[A-Za-z0-9_]*\$)[\s\S]*?\1/g, '$1$1')
    .replace(/'(?:[^']|'')*'/g, "''");
}

function normalizeArgument(argument: string): string | null {
  const withoutDefault = argument.split(/\s+(?:DEFAULT)\s+|=/i, 1)[0].trim();
  const tokens = withoutDefault.replace(/"/g, '').split(/\s+/);
  const mode = tokens[0]?.toLowerCase();

  if (mode === 'out') return null;
  if (mode === 'in' || mode === 'inout' || mode === 'variadic') tokens.shift();

  const first = tokens[0]?.toLowerCase() ?? '';
  const firstIsType =
    TYPE_STARTS.has(first) ||
    first.startsWith('any') ||
    first.includes('.') ||
    first.endsWith('[]');
  if (tokens.length > 1 && !firstIsType) tokens.shift();

  return tokens.join(' ').toLowerCase();
}

export function normalizeSql(sql: string): string {
  return stripNonStatements(sql).replace(/\s+/g, ' ').trim();
}

export function closingParen(sql: string, openingIndex: number): number {
  let depth = 0;
  for (let index = openingIndex; index < sql.length; index += 1) {
    if (sql[index] === '(') depth += 1;
    if (sql[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

export function splitArguments(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '(') depth += 1;
    if (args[index] === ')') depth -= 1;
    if (args[index] === ',' && depth === 0) {
      parts.push(args.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(args.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

export function normalizeSignature(args: string): string {
  return splitArguments(args)
    .map(normalizeArgument)
    .filter((argument): argument is string => Boolean(argument))
    .join(', ');
}
