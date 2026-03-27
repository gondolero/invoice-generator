type Token = { type: 'number'; value: number } | { type: 'name'; value: string } | { type: 'op'; value: string } | { type: 'paren'; value: '(' | ')' }

export function tokenize(formula: string, knownNames: string[]): Token[] {
  const tokens: Token[] = []
  // Sort names by length descending for longest-match-first
  const sorted = [...knownNames].sort((a, b) => b.length - a.length)
  let i = 0
  while (i < formula.length) {
    if (/\s/.test(formula[i])) { i++; continue }
    if ('+-*/'.includes(formula[i])) { tokens.push({ type: 'op', value: formula[i] }); i++; continue }
    if (formula[i] === '(' || formula[i] === ')') { tokens.push({ type: 'paren', value: formula[i] as '(' | ')' }); i++; continue }
    // Try matching a known column name (case-insensitive)
    const rest = formula.slice(i)
    const matched = sorted.find(name => rest.toLowerCase().startsWith(name.toLowerCase()))
    if (matched) { tokens.push({ type: 'name', value: matched }); i += matched.length; continue }
    // Try matching a number
    const numMatch = rest.match(/^(\d+(\.\d+)?)/)
    if (numMatch) { tokens.push({ type: 'number', value: parseFloat(numMatch[1]) }); i += numMatch[0].length; continue }
    // Unknown character — skip
    i++
  }
  return tokens
}

// Recursive descent parser: expr → term ((+|-) term)*
// term → factor ((*|/) factor)*
// factor → number | name | '(' expr ')' | unary-minus factor
function parse(tokens: Token[], variables: Record<string, number>): number | null {
  let pos = 0
  const peek = () => tokens[pos]
  const consume = () => tokens[pos++]

  function expr(): number | null {
    let left = term()
    if (left === null) return null
    while (peek()?.type === 'op' && (peek()!.value === '+' || peek()!.value === '-')) {
      const op = consume()!.value
      const right = term()
      if (right === null) return null
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  function term(): number | null {
    let left = factor()
    if (left === null) return null
    while (peek()?.type === 'op' && (peek()!.value === '*' || peek()!.value === '/')) {
      const op = consume()!.value
      const right = factor()
      if (right === null) return null
      if (op === '/') { if (right === 0) return null; left = left / right }
      else left = left * right
    }
    return left
  }

  function factor(): number | null {
    const tok = peek()
    if (!tok) return null
    if (tok.type === 'number') { consume(); return tok.value }
    if (tok.type === 'name') { consume(); return variables[tok.value] ?? 0 }
    if (tok.type === 'op' && tok.value === '-') { consume(); const v = factor(); return v === null ? null : -v }
    if (tok.type === 'paren' && tok.value === '(') {
      consume()
      const val = expr()
      if (peek()?.type === 'paren' && peek()!.value === ')') consume()
      return val
    }
    return null
  }

  const result = expr()
  return result
}

export function evaluateFormula(
  formula: string,
  variables: Record<string, number>,
  knownNames: string[]
): number | null {
  if (!formula.trim()) return null
  try {
    const tokens = tokenize(formula, knownNames)
    if (tokens.length === 0) return null
    return parse(tokens, variables)
  } catch {
    return null
  }
}

// Extract column names referenced in a formula
export function getFormulaReferences(formula: string, knownNames: string[]): string[] {
  const tokens = tokenize(formula, knownNames)
  return tokens.filter(t => t.type === 'name').map(t => t.value)
}
