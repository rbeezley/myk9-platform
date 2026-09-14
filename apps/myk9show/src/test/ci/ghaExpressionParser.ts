/**
 * Tiny recursive-descent parser for the boolean subset of GitHub Actions'
 * expression syntax (`&&`, `||`, parentheses, and everything else treated as
 * an opaque atom — comparisons, function calls, property paths).
 *
 * Exists because a `workflow.includes(...)` / substring check on a job's
 * `if:` line cannot tell `A && (B || C)` apart from `(A && B) || C` — the
 * exact difference between "still gated" and "label alone bypasses every
 * other gate" (MYK9-520 review finding). This parser builds the real
 * operator-precedence tree (`&&` binds tighter than `||`, matching GitHub
 * Actions' documented precedence) so a test can assert on STRUCTURE.
 *
 * Deliberately narrow: it does not evaluate the expression, does not model
 * unary `!`, and treats a function call (`contains(a, b)`) as a single atom
 * by tracking paren depth while scanning it, rather than trying to parse its
 * arguments. That is enough for every `if:` line in this repo's workflows.
 */

export type GhaExpr =
  | { type: 'atom'; text: string }
  | { type: 'and'; operands: GhaExpr[] }
  | { type: 'or'; operands: GhaExpr[] }
  | { type: 'group'; inner: GhaExpr };

/** Parse a full GitHub Actions boolean expression (an `if:` value, minus any `${{ }}` wrapper). */
export function parseGhaExpression(source: string): GhaExpr {
  const [node, end] = parseOr(source, 0);
  const trailing = source.slice(skipWs(source, end)).trim();
  if (trailing.length > 0) {
    throw new Error(`unexpected trailing input after expression: ${JSON.stringify(trailing)}`);
  }
  return node;
}

/** Every top-level `&&` operand, whether the root parsed as a single node or an `and`. */
export function topLevelAndOperands(expr: GhaExpr): GhaExpr[] {
  return expr.type === 'and' ? expr.operands : [expr];
}

function skipWs(s: string, i: number): number {
  let j = i;
  while (j < s.length && /\s/.test(s[j] ?? '')) j += 1;
  return j;
}

function parseOr(s: string, start: number): [GhaExpr, number] {
  const [first, afterFirst] = parseAnd(s, start);
  const operands = [first];
  let i = skipWs(s, afterFirst);
  while (s.slice(i, i + 2) === '||') {
    const [next, afterNext] = parseAnd(s, skipWs(s, i + 2));
    operands.push(next);
    i = skipWs(s, afterNext);
  }
  return operands.length === 1 ? [operands[0]!, i] : [{ type: 'or', operands }, i];
}

function parseAnd(s: string, start: number): [GhaExpr, number] {
  const [first, afterFirst] = parseUnary(s, start);
  const operands = [first];
  let i = skipWs(s, afterFirst);
  while (s.slice(i, i + 2) === '&&') {
    const [next, afterNext] = parseUnary(s, skipWs(s, i + 2));
    operands.push(next);
    i = skipWs(s, afterNext);
  }
  return operands.length === 1 ? [operands[0]!, i] : [{ type: 'and', operands }, i];
}

/** A single operand: a parenthesized sub-expression, or an atom running up to the next `&&`/`||`/`)`. */
function parseUnary(s: string, start: number): [GhaExpr, number] {
  const i0 = skipWs(s, start);

  // A '(' reached here (i.e. not immediately preceded by an identifier we
  // were mid-way through consuming) is a GROUPING paren, never a call --
  // a call's '(' is only ever seen from inside the atom-scanning loop below,
  // where it is tracked as depth rather than treated as the start of a new
  // operand.
  if (s[i0] === '(') {
    const [inner, afterInner] = parseOr(s, i0 + 1);
    const closeAt = skipWs(s, afterInner);
    if (s[closeAt] !== ')') {
      throw new Error(`expected ')' at index ${closeAt} in: ${s}`);
    }
    return [{ type: 'group', inner }, closeAt + 1];
  }

  let i = i0;
  let depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '(') {
      depth += 1;
      i += 1;
      continue;
    }
    if (c === ')') {
      if (depth === 0) break; // closes an ENCLOSING group; let the caller consume it
      depth -= 1;
      i += 1;
      continue;
    }
    if (depth === 0 && (s.slice(i, i + 2) === '&&' || s.slice(i, i + 2) === '||')) break;
    i += 1;
  }

  const text = s.slice(i0, i).trim();
  if (text.length === 0) {
    throw new Error(`expected an operand at index ${i0} in: ${s}`);
  }
  return [{ type: 'atom', text }, i];
}
