# autoresearch: source map VLQ codec optimization

Optimize a source map VLQ encoder/decoder in TypeScript for maximum throughput.

## Setup

1. Agree on a run tag (e.g. `mar28-vlq`)
2. Create branch: `git checkout -b autoresearch/<tag>`
3. Read these files for context:
   - `src/codec.ts` -- the file you modify
   - `corpus.ts` -- frozen corpus generator (do not modify)
   - `bench.ts` -- frozen benchmark runner (do not modify)
   - `verify.ts` -- frozen correctness checker (do not modify)
4. Install deps: `npm install`
5. Run the baseline: `./eval.sh`
6. Initialize results.tsv with the header and baseline result.

## Experimentation

Each experiment modifies the codec, verifies correctness, then benchmarks.

**What you CAN do:**
- Modify `src/codec.ts`. Algorithms, data structures, lookup tables, TypedArrays, buffer management, bit manipulation -- everything is fair game.
- Completely rewrite the approach as long as the API contract holds.

**What you CANNOT do:**
- Modify `corpus.ts`, `bench.ts`, `verify.ts`, or `eval.sh`.
- Change the exported function signatures: `decode(mappings: string): SourceMapSegment[][]` and `encode(decoded: SourceMapSegment[][]): string`.
- Change the `SourceMapSegment` type.
- Use native addons, WASM, or worker threads.

**The goal: minimize METRIC (total ms for decode + encode across 30 iterations of the full corpus).** Lower is better.

**Correctness contract:** `verify.ts` checks:
- decode(encoded) matches expected decoded arrays
- encode(decoded) reproduces the original encoded string
- Full roundtrip: decode(encode(decoded)) matches decoded
- Edge cases: empty strings, semicolons, known values, negative numbers

**Simplicity criterion**: Simpler code that achieves the same speed beats complex code. But this is a performance problem -- complexity is justified if it delivers real speedups.

**The first run**: Establish the baseline by running `./eval.sh` with the unmodified codec.ts.

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
a1b2c3d	5000.0	keep	baseline
b2c3d4e	3200.0	keep	charCodeAt lookup table for base64 decode
```

## The experiment loop

LOOP FOREVER:

1. Look at the current src/codec.ts and recent results
2. Form a hypothesis about what change will reduce the metric
3. Edit src/codec.ts
4. git commit
5. Run: `./eval.sh`
6. Read the METRIC line
7. If verify failed: fix the bug or revert
8. Record in results.tsv (do NOT commit this file)
9. If metric improved (lower number): keep the commit
10. If worse or equal: `git reset HEAD~1 --hard`

**Ideas to explore (roughly ordered by expected impact):**
- Replace B64_CHARS.indexOf() with a Uint8Array lookup table (charCode -> digit)
- Replace B64_CHARS[digit] with a pre-built Uint8Array (digit -> charCode) and String.fromCharCode
- Avoid string concatenation in encode — accumulate charCodes in a typed array, String.fromCharCode.apply at the end
- Avoid creating [value, offset] tuples in decodeVLQ — use a class or module-level variables
- Use charCodeAt instead of charAt in decode
- Pre-allocate output arrays for decoded segments
- Avoid creating intermediate segment arrays — decode directly into a flat Int32Array
- Single-pass decode without split operations (already done, but check for remaining allocations)
- Batch-encode common small values with a direct lookup table (values -15..15 map to 1-char VLQ)
- Unroll the VLQ decode loop for the common 1-2 character case

**Timeout**: If `./eval.sh` takes longer than 2 minutes, kill it and treat as failure.

**NEVER STOP**: Once the loop begins, do NOT pause to ask the human. If you run out of ideas, look at the per-case breakdown — find which case is slowest and target it. Re-read the code. Try combining previous near-misses.
