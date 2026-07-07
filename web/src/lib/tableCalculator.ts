export interface CellPosition {
  col: number;
  row: number;
}

export interface FormulaResult {
  value: string | number;
  error?: string;
}

function parseCellRef(ref: string): CellPosition | null {
  const match = ref.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  const colStr = match[1].toUpperCase();
  const row = parseInt(match[2], 10);
  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  return { col: col - 1, row: row - 1 };
}

function parseRange(range: string): CellPosition[] {
  const parts = range.split(':');
  if (parts.length !== 2) return [];
  const start = parseCellRef(parts[0]);
  const end = parseCellRef(parts[1]);
  if (!start || !end) return [];
  const cells: CellPosition[] = [];
  for (let r = start.row; r <= end.row; r++) {
    for (let c = start.col; c <= end.col; c++) {
      cells.push({ col: c, row: r });
    }
  }
  return cells;
}

function extractCellRefs(formula: string): string[] {
  const refs: string[] = [];
  const pattern = /[A-Za-z]+\d+/g;
  let match;
  while ((match = pattern.exec(formula)) !== null) {
    refs.push(match[0]);
  }
  return refs;
}

function tokenize(formula: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const len = formula.length;
  while (i < len) {
    const ch = formula[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < len && /[A-Za-z\d]/.test(formula[j])) j++;
      tokens.push(formula.slice(i, j));
      i = j;
      continue;
    }
    if (/\d/.test(ch) || ch === '.') {
      let j = i;
      while (j < len && /\d/.test(formula[j])) j++;
      if (j < len && formula[j] === '.') {
        j++;
        while (j < len && /\d/.test(formula[j])) j++;
      }
      tokens.push(formula.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < len && formula[j] !== '"') {
        if (formula[j] === '\\') j++;
        j++;
      }
      tokens.push(formula.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    tokens.push(ch);
    i++;
  }
  return tokens;
}

function evaluateExpression(
  tokens: string[],
  cellValues: Map<string, string | number>,
  getCellValue: (ref: string) => string | number
): { value: string | number; error?: string } {
  try {
    const stack: (string | number)[] = [];
    const opStack: string[] = [];
    const precedence: Record<string, number> = {
      '(': 0,
      ')': 0,
      '+': 1,
      '-': 1,
      '*': 2,
      '/': 2,
      '>': 3,
      '<': 3,
      '>=': 3,
      '<=': 3,
      '==': 3,
      '!=': 3
    };

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (/^[A-Za-z]+\d+$/.test(token)) {
        stack.push(getCellValue(token));
      } else if (/^-?\d+(\.\d+)?$/.test(token)) {
        stack.push(parseFloat(token));
      } else if (token.startsWith('"') && token.endsWith('"')) {
        stack.push(token.slice(1, -1));
      } else if (token === '(') {
        opStack.push(token);
      } else if (token === ')') {
        while (opStack.length > 0 && opStack[opStack.length - 1] !== '(') {
          const op = opStack.pop()!;
          const b = stack.pop()!;
          const a = stack.pop()!;
          stack.push(applyOp(op, a, b));
        }
        opStack.pop();
      } else if (precedence[token]) {
        while (
          opStack.length > 0 &&
          precedence[opStack[opStack.length - 1]] >= precedence[token]
        ) {
          const op = opStack.pop()!;
          const b = stack.pop()!;
          const a = stack.pop()!;
          stack.push(applyOp(op, a, b));
        }
        opStack.push(token);
      }
    }

    while (opStack.length > 0) {
      const op = opStack.pop()!;
      const b = stack.pop()!;
      const a = stack.pop()!;
      stack.push(applyOp(op, a, b));
    }

    return { value: stack[0] };
  } catch {
    return { value: '#ERROR', error: '表达式计算错误' };
  }
}

function applyOp(op: string, a: string | number, b: string | number): string | number {
  const numA = typeof a === 'number' ? a : parseFloat(String(a)) || 0;
  const numB = typeof b === 'number' ? b : parseFloat(String(b)) || 0;
  switch (op) {
    case '+':
      return numA + numB;
    case '-':
      return numA - numB;
    case '*':
      return numA * numB;
    case '/':
      return numB === 0 ? '#ERROR' : numA / numB;
    case '>':
      return numA > numB ? 1 : 0;
    case '<':
      return numA < numB ? 1 : 0;
    case '>=':
      return numA >= numB ? 1 : 0;
    case '<=':
      return numA <= numB ? 1 : 0;
    case '==':
      return numA === numB ? 1 : 0;
    case '!=':
      return numA !== numB ? 1 : 0;
    default:
      return '#ERROR';
  }
}

function evaluateFunction(
  funcName: string,
  args: string[],
  cellValues: Map<string, string | number>,
  getCellValue: (ref: string) => string | number
): { value: string | number; error?: string } {
  try {
    const numericArgs: number[] = [];
    args.forEach(arg => {
      const rangeMatch = arg.match(/^[A-Za-z]+\d+:[A-Za-z]+\d+$/);
      if (rangeMatch) {
        const cells = parseRange(arg);
        cells.forEach(cell => {
          const ref = `${colIndexToLetter(cell.col)}${cell.row + 1}`;
          const val = getCellValue(ref);
          const num = typeof val === 'number' ? val : parseFloat(String(val)) || NaN;
          if (!isNaN(num)) numericArgs.push(num);
        });
      } else if (/^[A-Za-z]+\d+$/.test(arg)) {
        const val = getCellValue(arg);
        const num = typeof val === 'number' ? val : parseFloat(String(val)) || NaN;
        if (!isNaN(num)) numericArgs.push(num);
      } else if (/^-?\d+(\.\d+)?$/.test(arg)) {
        numericArgs.push(parseFloat(arg));
      }
    });

    switch (funcName.toUpperCase()) {
      case 'SUM':
        return { value: numericArgs.reduce((sum, n) => sum + n, 0) };
      case 'AVG':
        return { value: numericArgs.length > 0 ? numericArgs.reduce((sum, n) => sum + n, 0) / numericArgs.length : 0 };
      case 'COUNT':
        return { value: numericArgs.length };
      case 'MAX':
        return { value: numericArgs.length > 0 ? Math.max(...numericArgs) : 0 };
      case 'MIN':
        return { value: numericArgs.length > 0 ? Math.min(...numericArgs) : 0 };
      case 'IF': {
        const conditionResult = evaluateExpression(tokenize(args[0]), cellValues, getCellValue);
        if (conditionResult.error) return conditionResult;
        const condition = typeof conditionResult.value === 'number' ? conditionResult.value !== 0 : !!conditionResult.value;
        return { value: condition ? args[1] : args[2] };
      }
      default:
        return { value: '#ERROR', error: `未知函数: ${funcName}` };
    }
  } catch {
    return { value: '#ERROR', error: '函数计算错误' };
  }
}

function parseFormula(
  formula: string,
  cellValues: Map<string, string | number>,
  getCellValue: (ref: string) => string | number
): { value: string | number; error?: string } {
  if (!formula.startsWith('=')) {
    const num = parseFloat(formula);
    return isNaN(num) ? { value: formula } : { value: num };
  }

  const expr = formula.slice(1);

  const funcMatch = expr.match(/^([A-Za-z]+)\((.*)\)$/);
  if (funcMatch) {
    const funcName = funcMatch[1];
    const argsStr = funcMatch[2];
    const args = parseArguments(argsStr);
    return evaluateFunction(funcName, args, cellValues, getCellValue);
  }

  const tokens = tokenize(expr);
  return evaluateExpression(tokens, cellValues, getCellValue);
}

function parseArguments(argsStr: string): string[] {
  const args: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function detectCircularReference(
  cellId: string,
  formula: string,
  cellFormulas: Map<string, string>,
  visited: Set<string> = new Set()
): boolean {
  if (visited.has(cellId)) return true;
  visited.add(cellId);

  const refs = extractCellRefs(formula);
  for (const ref of refs) {
    const refFormula = cellFormulas.get(ref);
    if (refFormula) {
      if (detectCircularReference(ref, refFormula, cellFormulas, new Set(visited))) {
        return true;
      }
    }
  }
  return false;
}

function topologicalSort(cellFormulas: Map<string, string>): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  cellFormulas.forEach((formula, cellId) => {
    inDegree.set(cellId, 0);
    adjacency.set(cellId, []);
  });

  cellFormulas.forEach((formula, cellId) => {
    const refs = extractCellRefs(formula);
    for (const ref of refs) {
      if (cellFormulas.has(ref)) {
        adjacency.get(ref)!.push(cellId);
        inDegree.set(cellId, (inDegree.get(cellId) || 0) + 1);
      }
    }
  });

  const queue: string[] = [];
  inDegree.forEach((degree, cellId) => {
    if (degree === 0) queue.push(cellId);
  });

  const result: string[] = [];
  while (queue.length > 0) {
    const cellId = queue.shift()!;
    result.push(cellId);
    const neighbors = adjacency.get(cellId) || [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  return result;
}

export function calculateTable(tableEl: HTMLTableElement): void {
  const rows = tableEl.querySelectorAll('tr');
  const cellValues = new Map<string, string | number>();
  const cellFormulas = new Map<string, string>();
  const cellElements = new Map<string, HTMLTableCellElement>();

  rows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll('td, th');
    cells.forEach((cell, colIndex) => {
      const cellEl = cell as HTMLTableCellElement;
      const formula = cellEl.getAttribute('data-formula') || '';
      const textContent = cellEl.textContent || '';

      const colStr = colIndexToLetter(colIndex);
      const cellId = `${colStr}${rowIndex + 1}`;

      cellElements.set(cellId, cellEl);

      if (formula) {
        cellFormulas.set(cellId, formula);
      } else if (textContent.trim().startsWith('=')) {
        cellEl.setAttribute('data-formula', textContent.trim());
        cellFormulas.set(cellId, textContent.trim());
      } else {
        const num = parseFloat(textContent.trim());
        cellValues.set(cellId, isNaN(num) ? textContent.trim() : num);
      }
    });
  });

  const circularCells: string[] = [];
  cellFormulas.forEach((formula, cellId) => {
    if (detectCircularReference(cellId, formula, cellFormulas)) {
      circularCells.push(cellId);
    }
  });
  for (let i = 0; i < circularCells.length; i++) {
    const cellId = circularCells[i];
    const cellEl = cellElements.get(cellId);
    if (cellEl) {
      cellEl.textContent = '#CIRCULAR';
    }
    cellValues.set(cellId, '#CIRCULAR');
    cellFormulas.delete(cellId);
  }

  const sortedCells = topologicalSort(cellFormulas);

  for (const cellId of sortedCells) {
    const formula = cellFormulas.get(cellId)!;
    const getCellValue = (ref: string): string | number => {
      const val = cellValues.get(ref);
      return val !== undefined ? val : 0;
    };

    const result = parseFormula(formula, cellValues, getCellValue);
    cellValues.set(cellId, result.value);

    const cellEl = cellElements.get(cellId);
    if (cellEl) {
      cellEl.textContent = String(result.value);
    }
  }
}

function colIndexToLetter(index: number): string {
  let letter = '';
  let num = index + 1;
  while (num > 0) {
    const remainder = (num - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    num = Math.floor((num - 1) / 26);
  }
  return letter;
}

export function calculateAllTables(container: HTMLElement): void {
  const tables = container.querySelectorAll('table');
  tables.forEach(table => calculateTable(table as HTMLTableElement));
}