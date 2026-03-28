// Deterministic workload generator for benchmarking.
// FROZEN — do not modify during autoresearch.

// Mulberry32 PRNG
function prng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    const t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    const u = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((u ^ (u >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Workload {
  name: string;
  capacity: number;
  ops: Array<{ type: "get" | "set"; key: number; value?: number }>;
}

// Generate a sequence of get/set operations with a given key distribution
function generateOps(
  count: number,
  keySpace: number,
  readRatio: number,
  rng: () => number,
): Array<{ type: "get" | "set"; key: number; value?: number }> {
  const ops: Array<{ type: "get" | "set"; key: number; value?: number }> = [];
  for (let i = 0; i < count; i++) {
    const key = (rng() * keySpace) | 0;
    if (rng() < readRatio) {
      ops.push({ type: "get", key });
    } else {
      ops.push({ type: "set", key, value: (rng() * 1_000_000) | 0 });
    }
  }
  return ops;
}

// Zipfian-ish distribution: most accesses hit a small number of hot keys
function generateZipfOps(
  count: number,
  keySpace: number,
  readRatio: number,
  rng: () => number,
): Array<{ type: "get" | "set"; key: number; value?: number }> {
  const ops: Array<{ type: "get" | "set"; key: number; value?: number }> = [];
  for (let i = 0; i < count; i++) {
    // Square the random to skew toward lower keys (hot keys)
    const r = rng();
    const key = (r * r * keySpace) | 0;
    if (rng() < readRatio) {
      ops.push({ type: "get", key });
    } else {
      ops.push({ type: "set", key, value: (rng() * 1_000_000) | 0 });
    }
  }
  return ops;
}

export function generateWorkloads(): Workload[] {
  const rng = prng(42);

  return [
    // 1. Small cache, uniform access, read-heavy (API rate-limit style)
    {
      name: "small-uniform-reads",
      capacity: 100,
      ops: generateOps(50_000, 200, 0.8, rng),
    },

    // 2. Medium cache, zipfian access, mixed (web server style)
    {
      name: "medium-zipf-mixed",
      capacity: 1_000,
      ops: generateZipfOps(100_000, 5_000, 0.7, rng),
    },

    // 3. Large cache, uniform writes (bulk loading / warming)
    {
      name: "large-uniform-writes",
      capacity: 10_000,
      ops: generateOps(100_000, 50_000, 0.2, rng),
    },

    // 4. Tiny cache, massive thrash (pathological eviction)
    {
      name: "tiny-thrash",
      capacity: 16,
      ops: generateOps(100_000, 1_000, 0.5, rng),
    },

    // 5. Large cache, zipfian reads (DNS/session cache style)
    {
      name: "large-zipf-reads",
      capacity: 10_000,
      ops: generateZipfOps(100_000, 20_000, 0.9, rng),
    },

    // 6. Set-heavy burst then read-heavy (cache warming then serving)
    {
      name: "warm-then-serve",
      capacity: 5_000,
      ops: [
        ...generateOps(30_000, 5_000, 0.1, rng),  // warm
        ...generateOps(70_000, 5_000, 0.95, rng),  // serve
      ],
    },
  ];
}
