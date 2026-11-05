import { posix } from 'node:path';
import ts from 'typescript';

/**
 * AST + select-string extraction for the PostgREST embed-grants guard
 * (MYK9-1711, LESSON postgrest-embed-grants). Pure functions only; the test
 * file owns the repo scan and the allowlists.
 */

export interface EmbedSite {
  line: number;
  base: string;
  /** Embedded relation name as PostgREST resolves it (alias and `!hint` stripped). */
  embed: string;
  /** The embed selects `*` (or nothing), which a column-granted role cannot run. */
  star: boolean;
}

export interface EmbedItem {
  name: string;
  star: boolean;
}

/** Top-level comma-separated items of one paren level of a select string. */
function splitTopLevel(s: string): string[] {
  let depth = 0;
  let start = 0;
  const items: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      items.push(s.slice(start, i));
      start = i + 1;
    }
  }
  items.push(s.slice(start));
  return items;
}

/** Aggregate functions that look like `name(...)` but are not embeds. */
const AGGREGATES = new Set(['count', 'sum', 'avg', 'min', 'max']);

/**
 * Embedded relation names in a PostgREST `select` string, nested ones included.
 * Items are comma separated at each paren depth; an item is an embed when it
 * has a `(` after a plain relation name (`alias:name!inner(`, `name!fk_hint(`).
 * `count()` aggregates, `col.count()`, casts (`col::text`) and JSON paths
 * (`col->>k`) are not embeds.
 */
export function extractEmbeds(select: string): string[] {
  return extractEmbedItems(select).map(item => item.name);
}

/** As `extractEmbeds`, also saying whether each embed selects `*` (or names no columns). */
export function extractEmbedItems(select: string): EmbedItem[] {
  const out: EmbedItem[] = [];
  const walk = (s: string) => {
    for (const raw of splitTopLevel(s)) {
      const item = raw.replace(/\s+/g, '');
      const open = item.indexOf('(');
      if (open < 0 || !item.endsWith(')')) continue;
      const head = item.slice(0, open);
      // `alias:name!hint!inner` -> name
      const afterAlias = head.includes(':') && !head.includes('::') ? head.split(':')[1] : head;
      const name = afterAlias.split('!')[0];
      if (!/^[a-z_][a-z0-9_]*$/i.test(name) || AGGREGATES.has(name)) continue;
      const inner = item.slice(open + 1, -1);
      const columns = splitTopLevel(inner).filter(Boolean);
      out.push({ name, star: columns.length === 0 || columns.includes('*') });
      walk(inner);
    }
  };
  walk(select);
  return out;
}

/** Reads a repo-relative path; undefined when the file does not exist. */
export type ReadFile = (path: string) => string | undefined;

/** Top-level `const` initializers and named imports of one file, for constant resolution. */
interface FileInfo {
  locals: Map<string, ts.Expression>;
  imports: Map<string, { spec: string; exported: string }>;
}

const MAX_CONST_DEPTH = 3;
const parsedFiles = new WeakMap<ReadFile, Map<string, FileInfo | null>>();

function parse(fileName: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function infoOf(sf: ts.SourceFile): FileInfo {
  const info: FileInfo = { locals: new Map(), imports: new Map() };
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer) info.locals.set(d.name.text, d.initializer);
      }
    } else if (
      ts.isImportDeclaration(st) &&
      ts.isStringLiteral(st.moduleSpecifier) &&
      st.importClause?.namedBindings &&
      ts.isNamedImports(st.importClause.namedBindings)
    ) {
      for (const el of st.importClause.namedBindings.elements) {
        info.imports.set(el.name.text, {
          spec: st.moduleSpecifier.text,
          exported: (el.propertyName ?? el.name).text,
        });
      }
    }
  }
  return info;
}

/** Repo-relative path candidates for a RELATIVE or `@/` import specifier; none for packages. */
function importCandidates(fromFile: string, spec: string): string[] {
  let base: string;
  if (spec.startsWith('@/')) base = posix.join('apps/myk9show/src', spec.slice(2));
  else if (spec.startsWith('./') || spec.startsWith('../'))
    base = posix.join(posix.dirname(fromFile), spec);
  else return [];
  return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base];
}

interface Ctx {
  readFile: ReadFile | undefined;
  cache: Map<string, FileInfo | null>;
}

function loadInfo(ctx: Ctx, path: string): FileInfo | null {
  if (ctx.cache.has(path)) return ctx.cache.get(path) ?? null;
  const src = ctx.readFile?.(path);
  const info = src === undefined ? null : infoOf(parse(path, src));
  ctx.cache.set(path, info);
  return info;
}

/** Value of constant `name` in `file`, following one import per hop, bounded and cycle-safe. */
function resolveConst(
  ctx: Ctx,
  file: string,
  info: FileInfo,
  name: string,
  depth: number,
  seen: Set<string>
): string | null {
  const key = `${file}#${name}`;
  if (depth > MAX_CONST_DEPTH || seen.has(key)) return null;
  const next = new Set(seen).add(key);
  const init = info.locals.get(name);
  if (init) return stringValue(init, ctx, file, info, depth, next);
  const imp = info.imports.get(name);
  if (!imp) return null;
  for (const cand of importCandidates(file, imp.spec)) {
    const target = loadInfo(ctx, cand);
    if (target) return resolveConst(ctx, cand, target, imp.exported, depth + 1, next);
  }
  return null;
}

function stringValue(
  node: ts.Node | undefined,
  ctx: Ctx,
  file: string,
  info: FileInfo,
  depth = 0,
  seen: Set<string> = new Set()
): string | null {
  if (!node) return null;
  const rec = (n: ts.Node) => stringValue(n, ctx, file, info, depth, seen);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    // A substitution that is not a resolvable string constant is dropped (a space stands in).
    return (
      node.head.text +
      node.templateSpans.map(sp => (rec(sp.expression) ?? ' ') + sp.literal.text).join('')
    );
  }
  if (ts.isIdentifier(node)) return resolveConst(ctx, file, info, node.text, depth, seen);
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    return rec(node.expression);
  return null;
}

/** Walk a call chain's receivers down to the `.from('<table>')` that starts it. */
function baseOfChain(expr: ts.Expression, val: (n: ts.Node) => string | null): string | null {
  let cur: ts.Node = expr;
  for (;;) {
    if (ts.isCallExpression(cur)) {
      const callee = cur.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'from' &&
        cur.arguments.length === 1
      ) {
        return val(cur.arguments[0]);
      }
      cur = callee;
    } else if (ts.isPropertyAccessExpression(cur) || ts.isNonNullExpression(cur)) {
      cur = cur.expression;
    } else if (ts.isAwaitExpression(cur) || ts.isParenthesizedExpression(cur)) {
      cur = cur.expression;
    } else return null;
  }
}

/**
 * Every `.from('<base>')...select('<string with embeds>')` chain in a source file.
 * `${CONST}` substitutions resolve through top-level string constants in this file
 * or imported (relative / `@/`) from a file `readFile` can supply.
 */
export function findEmbedSites(
  source: string,
  fileName = 'f.ts',
  readFile?: ReadFile
): EmbedSite[] {
  if (!source.includes('.select(')) return [];
  const sf = parse(fileName, source);
  const info = infoOf(sf);
  let cache = readFile ? parsedFiles.get(readFile) : undefined;
  if (readFile && !cache) parsedFiles.set(readFile, (cache = new Map()));
  const ctx: Ctx = { readFile, cache: cache ?? new Map() };
  const val = (n: ts.Node) => stringValue(n, ctx, fileName, info);
  const sites: EmbedSite[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'select' &&
      node.arguments.length >= 1
    ) {
      const sel = val(node.arguments[0]);
      if (sel && sel.includes('(')) {
        const base = baseOfChain(node.expression.expression, val);
        if (base) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          for (const { name, star } of extractEmbedItems(sel)) {
            sites.push({ line, base, embed: name, star });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}
