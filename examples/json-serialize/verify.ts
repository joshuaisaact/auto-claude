// Correctness check — our output must match JSON.stringify for the fields in the schema.
// FROZEN — do not modify during autoresearch.

import { compile, type Schema } from "./src/serialize.ts";
import { generateCorpus } from "./corpus.ts";

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

// For each corpus item, serialize with our compiler and compare against
// JSON.stringify of a projected object (only schema fields).
const corpus = generateCorpus();

for (const tc of corpus) {
  const serializer = compile(tc.schema);
  const schemaKeys = Object.keys(tc.schema.properties ?? {});
  let mismatches = 0;
  let firstMismatch = "";

  for (let i = 0; i < tc.data.length; i++) {
    const obj = tc.data[i] as Record<string, unknown>;

    // Build projected object with only schema fields (skip undefined/null)
    const projected: Record<string, unknown> = {};
    for (const k of schemaKeys) {
      if (obj[k] !== undefined && obj[k] !== null) {
        projected[k] = obj[k];
      }
    }

    const ours = serializer(tc.data[i]);
    const expected = JSON.stringify(projected);

    if (ours !== expected) {
      mismatches++;
      if (!firstMismatch) {
        const ourSnip = ours.length > 100 ? ours.slice(0, 100) + "..." : ours;
        const expSnip = expected.length > 100 ? expected.slice(0, 100) + "..." : expected;
        firstMismatch = `item ${i}: got ${ourSnip}\n    expected ${expSnip}`;
      }
    }
  }

  assert(
    mismatches === 0,
    `${tc.name}: ${mismatches}/${tc.data.length} mismatches\n    ${firstMismatch}`,
  );
}

// Edge cases with simple schemas
{
  const strSchema: Schema = { type: "string" };
  const s = compile(strSchema);

  assert(s('hello "world"') === JSON.stringify('hello "world"'), "escape double quotes");
  assert(s("back\\slash") === JSON.stringify("back\\slash"), "escape backslash");
  assert(s("new\nline") === JSON.stringify("new\nline"), "escape newline");
  assert(s("tab\there") === JSON.stringify("tab\there"), "escape tab");
  assert(s("\b\f\r") === JSON.stringify("\b\f\r"), "escape control chars");
  assert(s("") === '""', "empty string");
  assert(s("no escapes needed") === '"no escapes needed"', "clean string");
  assert(s("\x00") === JSON.stringify("\x00"), "null byte");
  assert(s("\x1f") === JSON.stringify("\x1f"), "unit separator");

  // Long string with escapes scattered throughout
  const longStr = "This is a \"test\" string with\nnewlines and\ttabs and \\backslashes scattered throughout the text to test real-world escaping patterns.";
  assert(s(longStr) === JSON.stringify(longStr), "long string with mixed escapes");
}

{
  const numSchema: Schema = { type: "number" };
  const n = compile(numSchema);
  assert(n(42) === "42", "integer");
  assert(n(3.14) === "3.14", "float");
  assert(n(0) === "0", "zero");
  assert(n(-1) === "-1", "negative");
}

{
  const boolSchema: Schema = { type: "boolean" };
  const b = compile(boolSchema);
  assert(b(true) === "true", "true");
  assert(b(false) === "false", "false");
}

{
  const nullSchema: Schema = { type: "null" };
  const n = compile(nullSchema);
  assert(n(null) === "null", "null");
}

{
  const arrSchema: Schema = { type: "array", items: { type: "integer" } };
  const a = compile(arrSchema);
  assert(a([]) === "[]", "empty array");
  assert(a([1, 2, 3]) === "[1,2,3]", "int array");
}

{
  const objSchema: Schema = {
    type: "object",
    properties: { x: { type: "integer" } },
  };
  const o = compile(objSchema);
  assert(o({}) === "{}", "empty object (no required fields)");
  assert(o({ x: 1 }) === '{"x":1}', "object with field");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
