// Compare our implementation against market-leading LRU caches.
// Calls each library's native API directly — no wrappers.

import { LRUCache as Ours } from "./src/lru.ts";
import { LRUCache as LruCacheLib } from "lru-cache";
import { LRUCache as Mnemonist } from "mnemonist";
import { generateWorkloads } from "./corpus.ts";

const workloads = generateWorkloads();
const ITERATIONS = 20;

// --- Ours (direct) ---
function benchOurs() {
  for (let i = 0; i < ITERATIONS; i++) {
    for (const wl of workloads) {
      const cache = new Ours<number, number>(wl.capacity);
      for (const op of wl.ops) {
        if (op.type === "set") cache.set(op.key, op.value!);
        else cache.get(op.key);
      }
    }
  }
}

// --- lru-cache (direct) ---
function benchLruCache() {
  for (let i = 0; i < ITERATIONS; i++) {
    for (const wl of workloads) {
      const cache = new LruCacheLib<number, number>({ max: wl.capacity });
      for (const op of wl.ops) {
        if (op.type === "set") cache.set(op.key, op.value!);
        else cache.get(op.key);
      }
    }
  }
}

// --- mnemonist (direct) ---
function benchMnemonist() {
  for (let i = 0; i < ITERATIONS; i++) {
    for (const wl of workloads) {
      const cache = new Mnemonist<number, number>(wl.capacity);
      for (const op of wl.ops) {
        if (op.type === "set") cache.set(op.key, op.value!);
        else cache.get(op.key);
      }
    }
  }
}

function run(name: string, fn: () => void) {
  // Warmup
  for (let i = 0; i < 3; i++) fn();

  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const median = times[2];
  const min = times[0];
  const max = times[4];
  console.log(
    `  ${name.padEnd(20)} median ${median.toFixed(1).padStart(7)}ms   (min ${min.toFixed(1)}, max ${max.toFixed(1)})`,
  );
}

console.log("=== comparison (direct calls, median of 5 runs) ===");
run("ours", benchOurs);
run("lru-cache", benchLruCache);
run("mnemonist", benchMnemonist);
