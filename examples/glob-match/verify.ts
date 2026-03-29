// Correctness check — verifies our glob matcher against picomatch.
// FROZEN — do not modify during autoresearch.

import { compile, isMatch } from "./src/glob.ts";
import picomatch from "picomatch";
import { generateWorkloads } from "./corpus.ts";

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

// Test each workload: our results must match picomatch exactly
const workloads = generateWorkloads();

for (const wl of workloads) {
  const ourMatcher = compile(wl.pattern);
  const pmMatcher = picomatch(wl.pattern);

  let mismatches = 0;
  let firstMismatch = "";

  for (const path of wl.paths) {
    const ours = ourMatcher(path);
    const theirs = pmMatcher(path);

    if (ours !== theirs) {
      mismatches++;
      if (!firstMismatch) {
        firstMismatch = `path="${path}" ours=${ours} picomatch=${theirs}`;
      }
    }
  }

  assert(
    mismatches === 0,
    `${wl.name}: ${mismatches} mismatches vs picomatch (first: ${firstMismatch})`,
  );
}

// Edge cases
{
  // Empty segments
  assert(isMatch("a/b/c", "a/**/c") === picomatch.isMatch("a/b/c", "a/**/c"), "globstar a/**/c");
  assert(isMatch("a/c", "a/**/c") === picomatch.isMatch("a/c", "a/**/c"), "globstar a/**/c (no middle)");

  // Dot files
  assert(isMatch(".gitignore", "*") === picomatch.isMatch(".gitignore", "*"), "dotfile with *");
  assert(isMatch(".gitignore", ".*") === picomatch.isMatch(".gitignore", ".*"), "dotfile with .*");

  // Exact match
  assert(isMatch("foo.ts", "foo.ts") === picomatch.isMatch("foo.ts", "foo.ts"), "exact match");

  // No match
  assert(isMatch("foo.ts", "bar.ts") === picomatch.isMatch("foo.ts", "bar.ts"), "no match");

  // Nested braces
  assert(
    isMatch("foo.ts", "*.{ts,{js,jsx}}") === picomatch.isMatch("foo.ts", "*.{ts,{js,jsx}}"),
    "nested braces",
  );

  // Escaped special chars
  assert(isMatch("foo*bar", "foo\\*bar") === picomatch.isMatch("foo*bar", "foo\\*bar"), "escaped star");
}

// Compilation + matching should be consistent
{
  const matcher = compile("**/*.ts");
  const result1 = matcher("src/foo.ts");
  const result2 = matcher("src/foo.ts");
  assert(result1 === result2, "compiled matcher is deterministic");
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
