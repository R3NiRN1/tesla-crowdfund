// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import ts from "typescript";
import { expect, test } from "vitest";

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sources(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

test("all application receipt waiters capture replacements at one confirmation", () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  let count = 0;
  for (const file of ["app", "components", "lib"].flatMap((path) => sources(join(frontend, path)))) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const waiters = new Set<string>();
    const namespaces = new Set<string>();
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)
        || !["wagmi", "@wagmi/core", "viem", "viem/actions"].includes(node.moduleSpecifier.text)) continue;
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
        if (["useWaitForTransactionReceipt", "waitForTransactionReceipt"].includes((binding.propertyName ?? binding.name).text)) waiters.add(binding.name.text);
      }
    }
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const waiter = ts.isIdentifier(callee) && waiters.has(callee.text)
          || ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
            && namespaces.has(callee.expression.text) && ["useWaitForTransactionReceipt", "waitForTransactionReceipt"].includes(callee.name.text);
        if (waiter) {
          count++;
          const options = node.arguments.at(-1);
          expect(options && ts.isObjectLiteralExpression(options), `Literal receipt options required in ${file}`).toBe(true);
          if (options && ts.isObjectLiteralExpression(options)) for (const property of options.properties) {
            expect(ts.isSpreadAssignment(property), `Do not hide confirmation policy in a spread: ${file}`).toBe(false);
            if (ts.isPropertyAssignment(property) && property.name.getText(source).replace(/["\x27]/g, "") === "confirmations") {
              expect(property.initializer.getText(source), `Separate finality from replacement detection in ${file}`).toBe("1");
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  expect(count).toBeGreaterThanOrEqual(3);
});
