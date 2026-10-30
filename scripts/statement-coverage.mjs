// Statement coverage measured from raw V8 block coverage (NODE_V8_COVERAGE) and the TypeScript parser.
// Node 20's built-in test coverage reports only line, branch and function percentages; a line that is partly
// executed counts as covered even when a statement on it never ran. This module counts statements directly:
// a statement is covered when the innermost V8 coverage range containing its first token has a non-zero count.
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const statementKinds = new Set([
  ts.SyntaxKind.VariableStatement,
  ts.SyntaxKind.ExpressionStatement,
  ts.SyntaxKind.ReturnStatement,
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ThrowStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.SwitchStatement,
  ts.SyntaxKind.TryStatement,
  ts.SyntaxKind.BreakStatement,
  ts.SyntaxKind.ContinueStatement,
  ts.SyntaxKind.LabeledStatement,
  ts.SyntaxKind.DebuggerStatement,
  ts.SyntaxKind.ImportDeclaration,
  ts.SyntaxKind.ExportDeclaration,
  ts.SyntaxKind.ExportAssignment,
  ts.SyntaxKind.ClassDeclaration,
]);

function isStatement(node) {
  if (statementKinds.has(node.kind)) return true;
  // Class field initializers and concise arrow-function bodies execute as statements.
  if (ts.isPropertyDeclaration(node)) return node.initializer !== undefined;
  return ts.isArrowFunction(node.parent) && node.parent.body === node && !ts.isBlock(node);
}

export function executableStatements(sourceText, fileName) {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const statements = [];
  const visit = (node) => {
    if (isStatement(node)) {
      const start = node.getStart(sourceFile);
      statements.push({ start, line: sourceFile.getLineAndCharacterOfPosition(start).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return statements;
}

export function countAt(functions, offset) {
  let best;
  for (const { ranges } of functions) {
    for (const range of ranges) {
      if (range.startOffset <= offset && offset < range.endOffset
        && (best === undefined || range.endOffset - range.startOffset < best.endOffset - best.startOffset)) best = range;
    }
  }
  return best === undefined ? 0 : best.count;
}

export function readV8Coverage(coverageDirectory) {
  const scripts = new Map();
  for (const name of readdirSync(coverageDirectory).filter((entry) => entry.endsWith(".json")).sort()) {
    for (const script of JSON.parse(readFileSync(join(coverageDirectory, name), "utf8")).result) {
      if (!script.url.startsWith("file:")) continue;
      const path = fileURLToPath(script.url);
      scripts.set(path, [...(scripts.get(path) ?? []), script.functions]);
    }
  }
  return scripts;
}

// Returns one entry per requested file. A file never loaded by any process is reported with loaded: false.
export function measureStatementCoverage(coverageDirectory, files) {
  const scripts = readV8Coverage(coverageDirectory);
  return files.map((file) => {
    const processes = scripts.get(realpathSync(file)) ?? [];
    const statements = executableStatements(readFileSync(file, "utf8"), file);
    const uncovered = statements.filter(({ start }) => !processes.some((functions) => countAt(functions, start) > 0));
    return {
      file,
      loaded: processes.length > 0,
      total: statements.length,
      covered: statements.length - uncovered.length,
      uncoveredLines: [...new Set(uncovered.map(({ line }) => line))],
    };
  });
}
