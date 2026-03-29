// Benchmark runner — measures glob matching throughput.
// FROZEN — do not modify during autoresearch.

import { compile } from "./src/glob.ts";
import { generateWorkloads } from "./corpus.ts";

const workloads = generateWorkloads();
const ITERATIONS = 50;

// Pre-compile all matchers
const matchers = workloads.map(wl => ({
  ...wl,
  matcher: compile(wl.pattern),
}));

// Warmup
for (let i = 0; i < 5; i++) {
  for (const wl of matchers) {
    for (const path of wl.paths) {
      wl.matcher(path);
    }
  }
}

// Measure matching speed (not compilation)
const start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  for (const wl of matchers) {
    for (const path of wl.paths) {
      wl.matcher(path);
    }
  }
}
const elapsed = performance.now() - start;

// Per-workload breakdown
console.log("=== per-workload ===");
for (const wl of matchers) {
  const s = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    for (const path of wl.paths) {
      wl.matcher(path);
    }
  }
  const e = performance.now() - s;
  const totalMatches = wl.paths.length * ITERATIONS;
  const mops = totalMatches / (e * 1000);
  console.log(
    `  ${wl.name.padEnd(22)} ${e.toFixed(1).padStart(8)}ms  ${mops.toFixed(1).padStart(6)} Mops/s  (${wl.paths.length} paths)`,
  );
}

const totalOps = workloads.reduce((s, wl) => s + wl.paths.length, 0) * ITERATIONS;
const mops = totalOps / (elapsed * 1000);

console.log("");
console.log(`patterns: ${workloads.length}`);
console.log(`paths per pattern: ${workloads[0].paths.length}`);
console.log(`iterations: ${ITERATIONS}`);
console.log(`total matches: ${totalOps.toLocaleString()}`);
console.log(`total: ${elapsed.toFixed(1)}ms (${mops.toFixed(1)} Mops/s)`);
console.log("");
console.log(`METRIC: ${elapsed.toFixed(1)}`);
