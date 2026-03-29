// Compare our serializer against JSON.stringify and fast-json-stringify.

import { compile } from "./src/serialize.ts";
import fastJsonStringify from "fast-json-stringify";
import { generateCorpus } from "./corpus.ts";

const corpus = generateCorpus();
const ITERATIONS = 200;

function benchOurs() {
  const serializers = corpus.map(tc => ({ s: compile(tc.schema), data: tc.data }));
  for (let i = 0; i < ITERATIONS; i++) {
    for (const tc of serializers) {
      for (const obj of tc.data) tc.s(obj);
    }
  }
}

function benchNative() {
  for (let i = 0; i < ITERATIONS; i++) {
    for (const tc of corpus) {
      for (const obj of tc.data) JSON.stringify(obj);
    }
  }
}

function benchFJS() {
  const serializers = corpus.map(tc => ({ s: fastJsonStringify(tc.schema as any), data: tc.data }));
  for (let i = 0; i < ITERATIONS; i++) {
    for (const tc of serializers) {
      for (const obj of tc.data) tc.s(obj);
    }
  }
}

function run(name: string, fn: () => void) {
  for (let i = 0; i < 3; i++) fn();
  const times: number[] = [];
  for (let r = 0; r < 5; r++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.log(`  ${name.padEnd(24)} median ${times[2].toFixed(1).padStart(7)}ms`);
}

console.log("=== comparison (median of 5) ===");
run("ours (naive)", benchOurs);
run("JSON.stringify", benchNative);
run("fast-json-stringify", benchFJS);
