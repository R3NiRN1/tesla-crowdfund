import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { ESLint, Linter } from "eslint";
import { globSync } from "../tools/next-root-glob/index.mjs";

const require = createRequire(import.meta.url);
const project = fileURLToPath(new URL("../", import.meta.url));
const pluginEntry = require.resolve("@next/eslint-plugin-next");
const pluginRoot = path.resolve(path.dirname(pluginEntry), "..");
const { getRootDirs } = require(path.join(pluginRoot, "dist/utils/get-root-dirs.js"));
const plugin = require("@next/eslint-plugin-next");
const originalCwd = process.cwd();
const fixture = mkdtempSync(path.join(tmpdir(), "tes-lint-toolchain-"));

before(() => {
  for (const directory of ["pages", "apps/creator/pages", "apps/backer/src/pages",
    "space project/pages", "apps/.hidden/pages", "apps/2/pages", "apps/WebCase/pages"]) {
    mkdirSync(path.join(fixture, directory), { recursive: true });
    writeFileSync(path.join(fixture, directory, "account.js"), "export default function Page() {}\n");
  }
  writeFileSync(path.join(fixture, "apps/not-a-directory"), "fixture\n");
  writeFileSync(path.join(fixture, "apps/creator/pages/creator-only.js"), "export default function Page() {}\n");
  writeFileSync(path.join(fixture, "apps/backer/src/pages/backer-only.js"), "export default function Page() {}\n");
  mkdirSync(path.join(fixture, "apps/app-only/app/account"), { recursive: true });
  writeFileSync(path.join(fixture, "apps/app-only/app/page.js"), "export default function Page() {}\n");
  writeFileSync(path.join(fixture, "apps/app-only/app/account/page.js"), "export default function Page() {}\n");
  process.chdir(fixture);
});
after(() => {
  process.chdir(originalCwd);
  assert.equal(path.dirname(fixture), path.resolve(tmpdir()));
  assert.ok(path.basename(fixture).startsWith("tes-lint-toolchain-"));
  rmSync(fixture, { recursive: true, force: true });
});

const normalize = (values) => values.map((value) => path.resolve(value)).sort();
const lookup = (rootDir) => getRootDirs({ cwd: fixture, settings: { next: { rootDir } } });

test("override is tied to the exact reviewed Next consumer and installed module", () => {
  assert.equal(JSON.parse(readFileSync(path.join(pluginRoot, "package.json"), "utf8")).version, "16.3.8");
  const consumer = readFileSync(path.join(pluginRoot, "dist/utils/get-root-dirs.js"));
  assert.equal(createHash("sha256").update(consumer).digest("hex"), "886677432990a735e5ebdfb345ff1cbd40e264f9947a8432eeeb254b3a926bde");
  const dist = path.join(pluginRoot, "dist");
  const consumers = readdirSync(dist, { recursive: true }).filter((name) => name.endsWith(".js")
    && /require\(["']fast-glob["']\)/.test(readFileSync(path.join(dist, name), "utf8")));
  assert.deepEqual(consumers.map((name) => name.replaceAll("\\", "/")), ["utils/get-root-dirs.js"]);
  const installed = require.resolve("fast-glob", { paths: [path.dirname(pluginEntry)] });
  assert.equal(installed, path.join(project, "tools/next-root-glob/index.mjs"));
  assert.equal(typeof require(installed).globSync, "function");
  const adapter = JSON.parse(readFileSync(path.join(project, "tools/next-root-glob/package.json"), "utf8"));
  assert.equal(adapter.name, "@tesla/next-root-directories");
  assert.equal(adapter.dependencies, undefined);
});

test("vulnerable matching packages and stale placeholder links are absent from the full lock", () => {
  const lock = JSON.parse(readFileSync(path.join(project, "package-lock.json"), "utf8"));
  const consumers = Object.entries(lock.packages).filter(([, metadata]) => metadata.dependencies?.["fast-glob"])
    .map(([location]) => location);
  assert.deepEqual(consumers, ["node_modules/@next/eslint-plugin-next"]);
  for (const [location, metadata] of Object.entries(lock.packages)) {
    assert.equal(/(?:^|\/)node_modules\/(?:braces|micromatch)$/.test(location), false, location);
    assert.equal(["braces", "micromatch"].includes(metadata.name), false, location);
    assert.notEqual(metadata.extraneous, true, location);
  }
});

for (const directory of ["apps/creator", "./apps/creator", "apps/creator//",
  "space project", "apps/.hidden", "apps/2", "apps/creator/.", "."]) {
  test("explicit directory is discovered without recursive expansion: " + directory, () => {
    assert.deepEqual(normalize(lookup(directory)), [path.resolve(directory)]);
  });
}
test("absolute current directory, dot suffix and child root remain absolute", () => {
  for (const absolute of [fixture, fixture + "/.", path.join(fixture, "apps/creator")]) {
    const result = lookup(absolute);
    assert.ok(result.every((entry) => path.isAbsolute(entry)));
    assert.deepEqual(normalize(result), [path.resolve(absolute)]);
  }
});
test("Windows-style separators are normalized by the real upstream consumer", () => {
  assert.deepEqual(normalize(lookup("apps\\creator")), normalize(["apps/creator"]));
});
test("arrays retain explicit roots and upstream ignores non-string settings", () => {
  assert.deepEqual(normalize(lookup(["apps/creator", 17, "space project"])), normalize(["apps/creator", "space project"]));
});
test("default root stays the lint context directory", () => assert.deepEqual(lookup(undefined), [fixture]));
test("effective repository config pins its existing frontend root, excluding empty-array bypass", async () => {
  const eslint = new ESLint({ cwd: project, overrideConfigFile: path.join(project, "eslint.config.mjs") });
  const config = await eslint.calculateConfigForFile(path.join(project, "app/page.tsx"));
  assert.equal(typeof config.settings.next.rootDir, "string");
  assert.equal(path.resolve(config.settings.next.rootDir), path.resolve(project));
  assert.deepEqual(lookup([]), []);
  assert.deepEqual(lookup([17, null, false]), []);
});
test("non-directories and missing roots fail instead of silently skipping checks", () => {
  for (const directory of ["missing", "apps/not-a-directory"]) assert.throws(() => lookup(directory), /explicit directory|must exist/);
});
test("unsupported API calls fail loudly", () => {
  for (const [directory, options] of [
    [["apps/creator"], { onlyDirectories: true }], ["apps/creator", {}], ["apps/creator", null],
    ["apps/creator", { onlyDirectories: false }], ["apps/creator", { onlyDirectories: true, cwd: fixture }],
  ]) assert.throws(() => globSync(directory, options), /Unsupported Next/);
});
test("deep brace input is rejected without a recursive pattern parser", () => {
  assert.throws(() => lookup("{".repeat(2048) + "x" + "}".repeat(2048)),
    (error) => !(error instanceof RangeError));
});
test("directory symlinks remain discoverable", () => {
  symlinkSync(path.join(fixture, "apps/creator"), path.join(fixture, "linked-project"),
    process.platform === "win32" ? "junction" : "dir");
  assert.deepEqual(normalize(lookup("linked-project")), normalize(["linked-project"]));
});
test("Windows literal lookup keeps filesystem case-insensitivity", { skip: process.platform !== "win32" }, () => {
  for (const directory of ["apps/WEBCASE", path.join(fixture, "apps/WEBCASE")]) {
    assert.deepEqual(normalize(lookup(directory)), [path.resolve(directory)]);
  }
});

function lintLink(rootDir, href, cwd = fixture) {
  return new Linter({ cwd }).verify(
    `export default function Example() { return <a href="${href}">Account</a>; }`, [{
      files: ["**/*.jsx"],
      languageOptions: { parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } } },
      plugins: { "@next/next": plugin },
      settings: { next: { rootDir } },
      rules: { "@next/next/no-html-link-for-pages": "error" },
    }], { filename: "fixture.jsx" });
}
for (const rootDir of [undefined, ".", fixture, fixture + "/.", "apps/creator",
  "apps/creator//", "space project", "apps/.hidden", "apps/2", ["apps/backer", "apps/creator"]]) {
  test("real Next rule rejects internal anchor: " + JSON.stringify(rootDir), () => {
    const messages = lintLink(rootDir, "/account");
    assert.equal(messages.length, 1, JSON.stringify(messages));
    assert.equal(messages[0].ruleId, "@next/next/no-html-link-for-pages");
  });
}
for (const pattern of ["apps/*", "apps/**", "apps/**/.hidden", "apps/**/{.hidden,creator}",
  "apps/{1..10}", "apps/{1..10..2}", "apps/{creator,}", "apps/{.,creator}"]) {
  test("real Next rule fails closed on unsupported glob: " + pattern, () => {
    assert.throws(() => lintLink(pattern, "/account"), /glob patterns are unsupported/);
  });
}
test("real Next rule permits external links", () => {
  assert.deepEqual(lintLink("apps/creator", "https://example.com/account"), []);
});
test("array roots enforce each project's distinct routes", () => {
  for (const route of ["/creator-only", "/backer-only"]) {
    const messages = lintLink(["apps/backer", "apps/creator"], route);
    assert.equal(messages.length, 1, JSON.stringify(messages));
    assert.equal(messages[0].ruleId, "@next/next/no-html-link-for-pages");
  }
});
test("App Router-only homepage remains checked", () => {
  const messages = lintLink("apps/app-only", "/");
  assert.equal(messages.length, 1, JSON.stringify(messages));
  assert.equal(messages[0].ruleId, "@next/next/no-html-link-for-pages");
});
test("nested App Router limitation matches unmodified upstream default-root behavior", () => {
  const appRoot = path.join(fixture, "apps/app-only");
  const baseline = lintLink(undefined, "/account", appRoot);
  assert.deepEqual(baseline, []);
  assert.deepEqual(lintLink(appRoot, "/account"), baseline);
});
test("real Next rule checks Windows case-mismatched literal roots", { skip: process.platform !== "win32" }, () => {
  for (const directory of ["apps/WEBCASE", path.join(fixture, "apps/WEBCASE")]) {
    const messages = lintLink(directory, "/account");
    assert.equal(messages.length, 1, JSON.stringify(messages));
    assert.equal(messages[0].ruleId, "@next/next/no-html-link-for-pages");
  }
});
