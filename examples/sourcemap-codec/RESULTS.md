# Source map codec autoresearch results

An autonomous Claude agent optimized a naive VLQ source map encoder/decoder through ~22 automated experiments, then we manually fixed a scaling issue in the encoder by studying @jridgewell/sourcemap-codec's approach. The final result is 12-23% faster than @jridgewell on real production source maps across all sizes.

## Numbers

Starting from a naive implementation (string concat encode, indexOf-based decode):

```
Baseline (synthetic):    334ms
After autoresearch:      103ms  (3.2x faster)
After manual encode fix: ~80ms  (on synthetic corpus)
```

### Real-world source map benchmarks

Tested against @jridgewell/sourcemap-codec v1.5.5, the library used by Vite, Rollup, Rolldown, Svelte, and most JS build tools. Median of 5 runs, 30 iterations each, direct API calls.

| Source map | Size | Ours | @jridgewell | Delta |
|---|---|---|---|---|
| moment | 89K | 16.9ms | 21.8ms | **23% faster** |
| rxjs | 205K | 37.1ms | 44.9ms | **17% faster** |
| chart.js | 310K | 62.7ms | 74.7ms | **16% faster** |
| pdf-lib | 575K | 121.9ms | 142.7ms | **15% faster** |
| babel-parser | 547K | 98.5ms | 117.3ms | **16% faster** |
| Next.js app SSR | 697K | 123.7ms | 144.9ms | **15% faster** |
| Next.js mega bundle | 946K | 193.4ms | 220.0ms | **12% faster** |

Faster on every map tested, at every size. Decode is consistently 5-20% faster, encode is 12-25% faster.

## What the agent found (autoresearch phase)

10 kept improvements out of ~22 experiments:

1. **Uint8Array lookup table** replaces `B64_CHARS.indexOf()` for decode — eliminates O(64) linear scan per character
2. **Eliminate tuple allocation** in VLQ decode — module-level vars instead of returning [value, offset]
3. **charCodeAt** instead of charAt — avoids string allocation per character
4. **VLQ string cache** for encode — flat array mapping values -1023..1023 to pre-encoded strings
5. **Inline VLQ decode** into main function — eliminates function call overhead
6. **Inline VLQ encode** into main function — same
7. **Single-char fast path** — most VLQ values encode to one character (digit < 32)
8. **Comma-prefixed VLQ cache** — pre-compute "," + vlqString to reduce concat count
9. **Branchless sign extension** — `((v >> 1) ^ -(v & 1)) + (v & 1)` instead of `v & 1 ? -(v >> 1) : v >> 1`
10. **Wider cache range** (-1023..1023) — catches more values in the cached fast path

Failed experiments included: Uint8Array buffer encode (slower on small maps), Map-based caches (lookup overhead), per-line string building (catastrophic on single-line minified maps), class-based nodes, string[] + join.

## What we found manually (encode scaling fix)

The agent's encode used `result += vlqString` string concatenation with a VLQ cache. This was fast for small maps but degraded on large ones (>500K chars) — V8's cons-string optimization breaks down at scale.

We studied @jridgewell/sourcemap-codec and found their solution: a `StringWriter` that accumulates bytes in a fixed 16KB `Uint8Array` and flushes to string via `TextDecoder` every 16K characters. This means `+=` only happens ~60 times for a 1MB output instead of hundreds of thousands of times.

We adopted this approach for encode while keeping all the agent's decode optimizations. The combination — our optimized decode + their chunked buffer encode pattern — beats both implementations individually.

## What we found manually (decode indexOf pre-scan)

Also adopted from jridgewell: using `String.indexOf(";")` to find line boundaries before processing each line. This is a native C++ operation that's faster than checking for semicolons character-by-character in the JS loop. It lets the inner decode loop only check for commas, not semicolons.

## Key V8 insights

- **TextDecoder with chunked Uint8Array beats string concat at scale.** Below ~100K output chars, `+=` with cached strings is faster. Above ~500K, the chunked buffer wins. The crossover depends on the cons-string chain length.
- **Branchless bit manipulation matters.** Source map deltas have unpredictable sign patterns, causing branch misprediction. The XOR trick (`(v >> 1) ^ -(v & 1)`) eliminated this.
- **Function inlining still matters.** Even though V8 can inline, manual inlining of the VLQ decode/encode gave measurable wins.
- **Lookup tables beat computation.** `Uint8Array[charCode]` is faster than any arithmetic for base64 decode. Pre-computed VLQ strings are faster than computing them on the fly.
