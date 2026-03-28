# LRU Cache autoresearch results

An autonomous Claude agent optimized a naive LRU cache implementation over 25 experiments in ~18 minutes of wall time. The final result beats both market-leading JS LRU libraries.

## Numbers

Starting from a naive Map delete/reinsert implementation:

```
Baseline:           4286.7ms
Final:               346.4ms  (12.3x faster)
```

Comparison against published libraries (median of 5 runs, direct API calls, no wrappers):

```
ours                 340.8ms
lru-cache v11        385.1ms  (+13%)
mnemonist v0.40      428.7ms  (+26%)
```

Feature parity with mnemonist (get, set, has, delete, peek, clear, forEach, keys, values, entries, Symbol.iterator) did not affect the hot path.

Benchmark: 11M ops across 6 workloads (uniform reads, zipfian mixed, bulk writes, thrash, zipfian reads, warm-then-serve), 20 iterations.

## What the agent found

**4 kept improvements:**

| # | Metric | Change |
|---|--------|--------|
| 1 | 361.0ms | Doubly-linked list with sentinel nodes (the big win: O(1) move-to-front and eviction) |
| 2 | 349.1ms | Pre-allocated node pool with free list, inline move-to-front |
| 3 | 348.6ms | Circular doubly-linked list with single sentinel |
| 4 | 346.4ms | SMI-initialized nodes, sentinel-terminated free list |

**21 reverted experiments (selected):**

- TypedArray-backed node pool (381ms) -- index-based indirection slower than V8's optimized object property access
- Plain object hash table (392ms) -- `delete obj[key]` causes V8 dictionary-mode deoptimization
- Class-based nodes (367ms) -- constructor overhead vs object literals
- Closure-based methods (403ms) -- per-instance function objects
- Parallel arrays (365ms) -- index lookups slower than object property access
- Two-Map hashlru architecture -- fails correctness (not strict LRU)
- CLOCK second-chance approximation -- fails correctness (not strict LRU)
- Various micro-optimizations (manual size tracking, caching locals, property reordering) -- all within noise

## Why it beats mnemonist

Mnemonist's core design choices turned out to be wrong for modern V8:

1. **TypedArrays for linked list pointers.** Mnemonist stores `forward`/`backward` as `Uint16Array`/`Uint32Array`. The agent tested this approach and found it ~10% slower -- V8's object property access is faster than TypedArray index lookups for this access pattern.

2. **`delete obj[key]` for eviction.** Mnemonist uses a plain object as its hash map and `delete` to remove evicted keys. The agent discovered this causes V8 to transition the object from "fast mode" to "dictionary mode", which is catastrophic for high-eviction workloads. Our implementation uses `Map.delete()` which doesn't have this problem.

3. **No node reuse.** When evicting, our implementation directly reuses the evicted node for the new entry, avoiding any allocation. Mnemonist recycles slot indices but still does more bookkeeping.

## V8 profile of final implementation

The implementation is fully Turbofan-optimized with zero deoptimizations. Hot path breakdown:

- ~65% benchmark harness + Map builtins (Map.get, Map.set, Map.delete, FindOrderedHashMapEntry)
- ~2.7% GC
- <1% our get/set functions (fully inlined by V8)

The bottleneck is V8's Map implementation itself. No further JS-level optimization is possible without replacing Map with a native addon or WASM.

Consistent across Node 18/20/22/24 (V8 10.x through 13.x).
