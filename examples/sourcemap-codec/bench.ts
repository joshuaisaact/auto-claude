// Benchmark runner — measures source map codec throughput.
// FROZEN — do not modify during autoresearch.

import { encode, decode } from "./src/codec.ts";
import { generateCorpus } from "./corpus.ts";

const corpus = generateCorpus();
const ITERATIONS = 10;

// Warmup
for (let i = 0; i < 5; i++) {
  for (const tc of corpus) {
    decode(tc.encoded);
    encode(tc.decoded);
  }
}

// Measure decode
const decodeStart = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  for (const tc of corpus) {
    decode(tc.encoded);
  }
}
const decodeElapsed = performance.now() - decodeStart;

// Measure encode
const encodeStart = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  for (const tc of corpus) {
    encode(tc.decoded);
  }
}
const encodeElapsed = performance.now() - encodeStart;

const totalElapsed = decodeElapsed + encodeElapsed;

// Total bytes processed
const totalEncodedBytes = corpus.reduce((sum, tc) => sum + tc.encoded.length, 0);
const totalSegments = corpus.reduce(
  (sum, tc) => sum + tc.decoded.reduce((s, line) => s + line.length, 0),
  0,
);

console.log("=== per-case ===");
for (const tc of corpus) {
  const ds = performance.now();
  for (let i = 0; i < ITERATIONS; i++) decode(tc.encoded);
  const de = performance.now() - ds;

  const es = performance.now();
  for (let i = 0; i < ITERATIONS; i++) encode(tc.decoded);
  const ee = performance.now() - es;

  const segs = tc.decoded.reduce((s, line) => s + line.length, 0);
  console.log(
    `  ${tc.name.padEnd(25)} decode ${de.toFixed(1).padStart(7)}ms  encode ${ee.toFixed(1).padStart(7)}ms  (${segs} segments, ${tc.encoded.length} chars)`,
  );
}

const decodeMBs = (totalEncodedBytes * ITERATIONS) / (decodeElapsed * 1000);
const encodeMBs = (totalEncodedBytes * ITERATIONS) / (encodeElapsed * 1000);

console.log("");
console.log(`corpus: ${totalSegments} segments, ${totalEncodedBytes} chars`);
console.log(`iterations: ${ITERATIONS}`);
console.log(`decode: ${decodeElapsed.toFixed(1)}ms (${decodeMBs.toFixed(1)} MB/s)`);
console.log(`encode: ${encodeElapsed.toFixed(1)}ms (${encodeMBs.toFixed(1)} MB/s)`);
console.log(`total: ${totalElapsed.toFixed(1)}ms`);
console.log("");
console.log(`METRIC: ${totalElapsed.toFixed(1)}`);
