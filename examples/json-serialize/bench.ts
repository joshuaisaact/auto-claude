// Benchmark runner — measures serialization throughput.
// FROZEN — do not modify during autoresearch.

import { compile } from "./src/serialize.ts";
import { generateCorpus } from "./corpus.ts";

const corpus = generateCorpus();
const ITERATIONS = 200;

// Pre-compile serializers
const cases = corpus.map(tc => ({
  name: tc.name,
  serializer: compile(tc.schema),
  data: tc.data,
}));

// Warmup
for (let i = 0; i < 3; i++) {
  for (const tc of cases) {
    for (const obj of tc.data) tc.serializer(obj);
  }
}

// Measure
const start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  for (const tc of cases) {
    for (const obj of tc.data) tc.serializer(obj);
  }
}
const elapsed = performance.now() - start;

// Per-case breakdown
console.log("=== per-case ===");
for (const tc of cases) {
  const s = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    for (const obj of tc.data) tc.serializer(obj);
  }
  const e = performance.now() - s;
  const totalOps = tc.data.length * ITERATIONS;
  const opsPerSec = totalOps / (e / 1000);
  console.log(
    `  ${tc.name.padEnd(30)} ${e.toFixed(1).padStart(8)}ms  ${(opsPerSec / 1000).toFixed(0).padStart(6)}K ops/s`,
  );
}

const totalOps = cases.reduce((s, tc) => s + tc.data.length, 0) * ITERATIONS;

console.log("");
console.log(`iterations: ${ITERATIONS}`);
console.log(`total serializations: ${totalOps.toLocaleString()}`);
console.log(`total: ${elapsed.toFixed(1)}ms`);
console.log("");
console.log(`METRIC: ${elapsed.toFixed(1)}`);
