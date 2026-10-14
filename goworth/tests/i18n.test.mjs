import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function source(path) {
  return ts.createSourceFile(path, readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
}

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

test("every catalog description and place detail has a Romanian translation", () => {
  const keys = new Set();
  walk(source("src/data/i18n.ts"), (node) => {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) keys.add(node.name.text);
  });

  const missing = [];
  for (const path of ["src/data/catalog.ts", "src/data/europe-places.ts", "src/data/romania.ts"]) {
    walk(source(path), (node) => {
      if (ts.isPropertyAssignment(node) && ["description", "detail"].includes(node.name.getText()) &&
        ts.isStringLiteral(node.initializer) && !keys.has(node.initializer.text)) {
        missing.push(`${path}: ${node.initializer.text}`);
      }
    });
  }
  assert.deepEqual(missing, []);
});
