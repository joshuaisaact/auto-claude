// Compare against @jridgewell/sourcemap-codec.

import { encode, decode } from "./src/codec.ts";
import { encode as jEncode, decode as jDecode } from "@jridgewell/sourcemap-codec";
import { generateCorpus } from "./corpus.ts";

const corpus = generateCorpus();
const ITERATIONS = 30;

function benchDecode(name: string, fn: (s: string) => unknown) {
  for (let i = 0; i < 5; i++) for (const tc of corpus) fn(tc.encoded);

  const times: number[] = [];
  for (let r = 0; r < 5; r++) {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) for (const tc of corpus) fn(tc.encoded);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.log(`  ${name.padEnd(24)} decode  median ${times[2].toFixed(1).padStart(7)}ms`);
}

function benchEncode(name: string, fn: (d: unknown) => unknown, data: unknown[]) {
  for (let i = 0; i < 5; i++) for (const d of data) fn(d);

  const times: number[] = [];
  for (let r = 0; r < 5; r++) {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) for (const d of data) fn(d);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.log(`  ${name.padEnd(24)} encode  median ${times[2].toFixed(1).padStart(7)}ms`);
}

console.log("=== comparison (median of 5 runs) ===");
benchDecode("ours", decode);
benchDecode("@jridgewell", jDecode);
console.log("");
benchEncode("ours", encode, corpus.map(tc => tc.decoded));
benchEncode("@jridgewell", jEncode, corpus.map(tc => tc.decoded));
