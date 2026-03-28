// Benchmark runner — measures LRU cache throughput.
// FROZEN — do not modify during autoresearch.

import { LRUCache } from "./src/lru.ts";
import { generateWorkloads } from "./corpus.ts";

const workloads = generateWorkloads();
const ITERATIONS = 20;

// Warmup
for (let i = 0; i < 3; i++) {
  for (const wl of workloads) {
    const cache = new LRUCache<number, number>(wl.capacity);
    for (const op of wl.ops) {
      if (op.type === "set") {
        cache.set(op.key, op.value!);
      } else {
        cache.get(op.key);
      }
    }
  }
}

// Measure total
const start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  for (const wl of workloads) {
    const cache = new LRUCache<number, number>(wl.capacity);
    for (const op of wl.ops) {
      if (op.type === "set") {
        cache.set(op.key, op.value!);
      } else {
        cache.get(op.key);
      }
    }
  }
}
const elapsed = performance.now() - start;

// Per-workload breakdown
console.log("=== per-workload ===");
for (const wl of workloads) {
  const wlStart = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const cache = new LRUCache<number, number>(wl.capacity);
    for (const op of wl.ops) {
      if (op.type === "set") {
        cache.set(op.key, op.value!);
      } else {
        cache.get(op.key);
      }
    }
  }
  const wlElapsed = performance.now() - wlStart;
  const totalOps = wl.ops.length * ITERATIONS;
  const mops = totalOps / (wlElapsed * 1000); // million ops/sec
  console.log(
    `  ${wl.name.padEnd(24)} ${wlElapsed.toFixed(1).padStart(8)}ms  ${mops.toFixed(2).padStart(6)} Mops/s  (${wl.ops.length} ops, cap=${wl.capacity})`,
  );
}

const totalOps = workloads.reduce((sum, wl) => sum + wl.ops.length, 0) * ITERATIONS;
const mops = totalOps / (elapsed * 1000);

console.log("");
console.log(`iterations: ${ITERATIONS}`);
console.log(`total ops: ${totalOps.toLocaleString()}`);
console.log(`total: ${elapsed.toFixed(1)}ms (${mops.toFixed(2)} Mops/s)`);
console.log("");
console.log(`METRIC: ${elapsed.toFixed(1)}`);
