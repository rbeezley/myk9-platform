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
  const out: string[] = [];
  const walk = (s: string) => {
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

    for (const raw of items) {
      const item = raw.replace(/\s+/g, '');
      const open = item.indexOf('(');
      if (open < 0 || !item.endsWith(')')) continue;
      const head = item.slice(0, open);
      // `alias:name!hint!inner` -> name
      const afterAlias = head.includes(':') && !head.includes('::') ? head.split(':')[1] : head;
      const name = afterAlias.split('!')[0];
      if (!/^[a-z_][a-z0-9_]*$/i.test(name) || AGGREGATES.has(name)) continue;
      out.push(name);
      walk(item.slice(open + 1, -1));
    }
  };
  walk(select);
  return out;
}

function stringValue(node: ts.Node | undefined, consts: Map<string, string>): string | null {
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    // Substitutions are dropped; they are field lists or fragments, not relation names we can see.
    return node.head.text + node.templateSpans.map(sp => ' ' + sp.literal.text).join('');
  }
  if (ts.isIdentifier(node)) return consts.get(node.text) ?? null;
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    return stringValue(node.expression, consts);
  return null;
}

/** Walk a call chain's receivers down to the `.from('<table>')` that starts it. */
function baseOfChain(expr: ts.Expression, consts: Map<string, string>): string | null {
  let cur: ts.Node = expr;
  for (;;) {
    if (ts.isCallExpression(cur)) {
      const callee = cur.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'from' &&
        cur.arguments.length === 1
      ) {
        return stringValue(cur.arguments[0], consts);
      }
      cur = callee;
    } else if (ts.isPropertyAccessExpression(cur) || ts.isNonNullExpression(cur)) {
      cur = cur.expression;
    } else if (ts.isAwaitExpression(cur) || ts.isParenthesizedExpression(cur)) {
      cur = cur.expression;
    } else return null;
  }
}

/** Every `.from('<base>')...select('<string with embeds>')` chain in a source file. */
export function findEmbedSites(source: string, fileName = 'f.ts'): EmbedSite[] {
  if (!source.includes('.select(')) return [];
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const consts = new Map<string, string>();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer && ts.isStringLiteralLike(d.initializer))
        consts.set(d.name.text, d.initializer.text);
    }
  }
  const sites: EmbedSite[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'select' &&
      node.arguments.length >= 1
    ) {
      const sel = stringValue(node.arguments[0], consts);
      if (sel && sel.includes('(')) {
        const base = baseOfChain(node.expression.expression, consts);
        if (base) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          for (const embed of extractEmbeds(sel)) sites.push({ line, base, embed });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}
