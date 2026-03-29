// Compare our glob matcher against picomatch.

import { compile } from "./src/glob.ts";
import picomatch from "picomatch";
import { generateWorkloads } from "./corpus.ts";

const workloads = generateWorkloads();
const ITERATIONS = 50;

function benchOurs() {
  const matchers = workloads.map(wl => ({ paths: wl.paths, matcher: compile(wl.pattern) }));
  for (let i = 0; i < ITERATIONS; i++) {
    for (const wl of matchers) {
      for (const path of wl.paths) wl.matcher(path);
    }
  }
}

function benchPicomatch() {
  const matchers = workloads.map(wl => ({ paths: wl.paths, matcher: picomatch(wl.pattern) }));
  for (let i = 0; i < ITERATIONS; i++) {
    for (const wl of matchers) {
      for (const path of wl.paths) wl.matcher(path);
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
  console.log(`  ${name.padEnd(20)} median ${times[2].toFixed(1).padStart(7)}ms`);
}

console.log("=== comparison — match only, pre-compiled (median of 5) ===");
run("ours", benchOurs);
run("picomatch", benchPicomatch);
