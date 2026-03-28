# autoresearch: LRU cache optimization

Optimize an LRU cache implementation in TypeScript for maximum throughput.

## Setup

1. Agree on a run tag (e.g. `mar28-lru`)
2. Create branch: `git checkout -b autoresearch/<tag>`
3. Read these files for context:
   - `src/lru.ts` -- the file you modify
   - `corpus.ts` -- frozen workload generator (do not modify)
   - `bench.ts` -- frozen benchmark runner (do not modify)
   - `verify.ts` -- frozen correctness checker (do not modify)
4. Install deps: `npm install`
5. Run the baseline: `./eval.sh`
6. Initialize results.tsv with the header and baseline result.

## Experimentation

Each experiment modifies the LRU implementation, verifies correctness, then benchmarks.

**What you CAN do:**
- Modify `src/lru.ts`. Data structures, memory layout, algorithms, TypedArrays, pre-allocation -- everything is fair game.
- Completely replace the internals. Doubly-linked list, array-based, TypedArray arena, open addressing -- any approach works.
- Add helper classes, lookup tables, or internal data structures.

**What you CANNOT do:**
- Modify `corpus.ts`, `bench.ts`, `verify.ts`, or `eval.sh`.
- Change the public API: `LRUCache` class with `constructor(capacity)`, `get(key)`, `set(key, value)`, `has(key)`, `size`.
- Use native addons, WASM, or worker threads.
- Specialize to numeric keys only. The implementation must remain generic (the verify tests use string keys).

**The goal: minimize METRIC (total ms for 20 iterations across all workloads).** Lower is better.

**Correctness contract:** `verify.ts` checks:
- get/set/has work correctly
- LRU eviction order is correct
- get() refreshes recency, has() does not
- Updates don't increase size
- Works with both string and number keys

**Simplicity criterion**: Simpler code that achieves the same speed beats complex code. But this is a performance problem -- complexity is justified if it delivers real speedups.

**The first run**: Establish the baseline by running `./eval.sh` with the unmodified lru.ts.

## Output format

```
./eval.sh
```

The last line of output is the metric:
```
METRIC: <number>
```

## Logging results

```
commit	metric_ms	status	description
a1b2c3d	850.0	keep	baseline
b2c3d4e	620.0	keep	doubly-linked list for O(1) move-to-front
```

## The experiment loop

LOOP FOREVER:

1. Look at the current src/lru.ts and recent results
2. Form a hypothesis about what change will reduce the metric
3. Edit src/lru.ts
4. git commit
5. Run: `./eval.sh`
6. Read the METRIC line
7. If verify failed: fix the bug or revert
8. Record in results.tsv (do NOT commit this file)
9. If metric improved (lower number): keep the commit
10. If worse or equal: `git reset HEAD~1 --hard`

**Ideas to explore (roughly ordered by expected impact):**
- Doubly-linked list with Map for O(1) get, set, and eviction (the classic LRU trick)
- TypedArray-backed node pool: store prev/next pointers in Int32Arrays, avoid object allocation
- Inline the linked list node into the Map value to reduce indirection
- Open-addressing hash table with embedded LRU chain (avoid Map overhead entirely)
- Pre-allocate all nodes up front, use a free list for recycling
- Specialize the hot path: branch-free move-to-front
- Sentinel nodes to eliminate null checks in list operations
- Profile which workload is slowest and target it specifically

**Timeout**: If `./eval.sh` takes longer than 2 minutes, kill it and treat as failure.

**NEVER STOP**: Once the loop begins, do NOT pause to ask the human. If you run out of ideas, look at the per-workload breakdown in the bench output -- find which workload is slowest and target it. Re-read the code. Try combining previous near-misses. Try more radical changes.
