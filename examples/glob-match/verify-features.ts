// Feature tests — verifies new glob features against picomatch.
// Tests: options (dot, nocase, matchBase, ignore), negation, brace ranges, extglobs.

import { compile, isMatch } from "./src/glob.ts";
import picomatch from "picomatch";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    failed++;
  } else {
    passed++;
  }
}

function check(path: string, pattern: string, opts?: Record<string, unknown>, label?: string) {
  const ours = isMatch(path, pattern, opts as any);
  const theirs = picomatch.isMatch(path, pattern, opts);
  const tag = label ?? `isMatch("${path}", "${pattern}"${opts ? ", " + JSON.stringify(opts) : ""})`;
  assert(ours === theirs, `${tag}: ours=${ours} pico=${theirs}`);
}

// --- dot option ---
console.log("-- dot option --");
check(".hidden", "*", { dot: true }, "dot: * matches .hidden");
check(".hidden", "*", {}, "no-dot: * skips .hidden");
check("dir/.hidden/file.ts", "**/*.ts", { dot: true }, "dot: globstar matches through .hidden dir");
check("dir/.hidden/file.ts", "**/*.ts", {}, "no-dot: globstar skips .hidden dir");
check(".gitignore", ".*", { dot: true }, "dot: .* matches .gitignore");
check(".gitignore", ".*", {}, "no-dot: .* matches .gitignore");

// --- nocase option ---
console.log("-- nocase option --");
check("FILE.TXT", "*.txt", { nocase: true }, "nocase: *.txt matches FILE.TXT");
check("FILE.TXT", "*.txt", {}, "case: *.txt does not match FILE.TXT");
check("SRC/App.tsx", "src/**/*.tsx", { nocase: true }, "nocase: case-insensitive dir match");
check("SRC/App.tsx", "src/**/*.tsx", {}, "case: case-sensitive dir match");

// --- matchBase option ---
console.log("-- matchBase option --");
check("src/lib/foo.js", "*.js", { matchBase: true }, "matchBase: *.js matches deeply nested file");
check("src/lib/foo.js", "*.js", {}, "no-matchBase: *.js does not match deeply nested file");
check("foo.js", "*.js", { matchBase: true }, "matchBase: *.js matches file with no dir");
check("src/deep/nested/bar.ts", "*.ts", { matchBase: true }, "matchBase: *.ts on deep path");

// --- ignore option ---
console.log("-- ignore option --");
check("src/foo.ts", "**/*.ts", { ignore: "**/*.test.ts" }, "ignore: non-test file passes");
check("src/foo.test.ts", "**/*.ts", { ignore: "**/*.test.ts" }, "ignore: test file filtered out");
check("src/foo.ts", "**/*.ts", { ignore: ["**/*.test.ts", "**/*.spec.ts"] }, "ignore array: non-test passes");
check("src/foo.spec.ts", "**/*.ts", { ignore: ["**/*.test.ts", "**/*.spec.ts"] }, "ignore array: spec filtered");

// --- negation ---
console.log("-- negation --");
check("foo.ts", "!foo.js", undefined, "negation: !foo.js matches foo.ts");
check("foo.js", "!foo.js", undefined, "negation: !foo.js rejects foo.js");
check("src/bar.ts", "!**/*.js", undefined, "negation: !**/*.js matches .ts");
check("src/bar.js", "!**/*.js", undefined, "negation: !**/*.js rejects .js");

// --- brace ranges (numeric) ---
console.log("-- brace ranges --");
{
  // {1..5}
  for (let n = 0; n <= 6; n++) {
    check(`file${n}.txt`, "file{1..5}.txt", undefined, `brace range: file${n}.txt vs {1..5}`);
  }
  // {01..03} zero-padded
  for (const s of ["00", "01", "02", "03", "04", "1", "2"]) {
    check(`f${s}.txt`, "f{01..03}.txt", undefined, `zero-padded range: f${s}.txt vs {01..03}`);
  }
  // {a..e} alpha range
  for (const c of ["a", "b", "c", "d", "e", "f", "z"]) {
    check(`${c}.txt`, "{a..e}.txt", undefined, `alpha range: ${c}.txt vs {a..e}`);
  }
  // Reverse range {5..1}
  for (let n = 0; n <= 6; n++) {
    check(`file${n}.txt`, "file{5..1}.txt", undefined, `reverse range: file${n}.txt vs {5..1}`);
  }
}

// --- extglobs ---
console.log("-- extglobs --");
// +(pattern) — one or more
check("foo", "+(foo)", undefined, "extglob +(): exact match");
check("foofoo", "+(foo)", undefined, "extglob +(): repeated match");
check("", "+(foo)", undefined, "extglob +(): empty string no match");

// *(pattern) — zero or more
check("", "*(foo)", undefined, "extglob *(): empty string matches");
check("foo", "*(foo)", undefined, "extglob *(): single match");
check("foofoo", "*(foo)", undefined, "extglob *(): repeated match");

// ?(pattern) — zero or one
check("", "?(foo)", undefined, "extglob ?(): empty string matches");
check("foo", "?(foo)", undefined, "extglob ?(): single match");
check("foofoo", "?(foo)", undefined, "extglob ?(): double does not match");

// @(pattern|pattern) — exactly one
check("foo", "@(foo|bar)", undefined, "extglob @(): first alt");
check("bar", "@(foo|bar)", undefined, "extglob @(): second alt");
check("baz", "@(foo|bar)", undefined, "extglob @(): no match");

// !(pattern) — negation extglob
check("baz", "!(foo|bar)", undefined, "extglob !(): matches non-excluded");
check("foo", "!(foo|bar)", undefined, "extglob !(): rejects excluded");
check("bar", "!(foo|bar)", undefined, "extglob !(): rejects excluded 2");

// Extglob in path patterns
check("src/foo.ts", "src/+(foo|bar).ts", undefined, "extglob in path: +(foo|bar).ts");
check("src/bar.ts", "src/+(foo|bar).ts", undefined, "extglob in path: bar.ts");
check("src/baz.ts", "src/+(foo|bar).ts", undefined, "extglob in path: baz.ts no match");

// --- combined options ---
console.log("-- combined options --");
check(".hidden.TXT", "*.txt", { dot: true, nocase: true }, "dot+nocase");
check("src/deep/.HIDDEN.TXT", "**/*.txt", { dot: true, nocase: true }, "dot+nocase deep");

// --- backward compatibility ---
console.log("-- backward compat --");
check("src/foo.ts", "**/*.ts", undefined, "compat: basic globstar still works");
check("src/foo.ts", "src/**/*.ts", undefined, "compat: prefix globstar still works");
check("src/foo.tsx", "**/*.{ts,tsx}", undefined, "compat: brace expansion still works");
{
  const m = compile("**/*.ts");
  assert(m("src/foo.ts") === true, "compat: compile() with no opts");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
