# autoresearch: schema-based JSON serializer optimization

Optimize a schema-based JSON serializer in TypeScript for maximum throughput.

## Setup

1. Agree on a run tag (e.g. `mar29-json`)
2. Create branch: `git checkout -b autoresearch/<tag>`
3. Read these files for context:
   - `src/serialize.ts` -- the file you modify
   - `corpus.ts` -- frozen workload generator (do not modify)
   - `bench.ts` -- frozen benchmark runner (do not modify)
   - `verify.ts` -- frozen correctness checker (do not modify)
4. Install deps: `npm install`
5. Run the baseline: `./eval.sh`
6. Initialize results.tsv with the header and baseline result.

## Experimentation

Each experiment modifies the serializer, verifies correctness, then benchmarks.

**What you CAN do:**
- Modify `src/serialize.ts`. String escaping, code generation, buffer management, lookup tables, pre-computation -- everything is fair game.
- Generate specialized functions at compile time (this is the key insight: you know the schema, so you can generate code that skips type checks).
- Use `new Function()` to generate optimized serializers at compile time.

**What you CANNOT do:**
- Modify `corpus.ts`, `bench.ts`, `verify.ts`, or `eval.sh`.
- Change the exported function signatures: `compile(schema: Schema): Serializer` and the `Schema`/`Serializer` types.
- Use native addons, WASM, or worker threads.

**The goal: minimize METRIC (total ms for 20 iterations across all workloads).** Lower is better. The benchmark only measures serialization speed, not compilation speed — schemas are pre-compiled.

**Correctness contract:** `verify.ts` checks that every serialized object matches `JSON.stringify(obj)` exactly. Output must be byte-identical. It also tests edge cases: escape characters, control chars, empty strings, empty arrays/objects, numbers, booleans, null.

**The first run**: Establish the baseline by running `./eval.sh` with the unmodified serialize.ts.

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
a1b2c3d	800.0	keep	baseline
b2c3d4e	500.0	keep	lookup table for string escaping
```

## The experiment loop

LOOP FOREVER:

1. Look at the current src/serialize.ts and recent results
2. Form a hypothesis about what change will reduce the metric
3. Edit src/serialize.ts
4. git commit
5. Run: `./eval.sh`
6. Read the METRIC line
7. If verify failed: fix the bug or revert
8. Record in results.tsv (do NOT commit this file)
9. If metric improved (lower number): keep the commit
10. If worse or equal: `git reset HEAD~1 --hard`

**Ideas to explore (roughly ordered by expected impact):**
- String escaping lookup table: pre-build a 128-entry array mapping char codes to their escaped form (or empty for no-escape). Replaces the if/else chain.
- Fast-path for strings with no special chars: scan the string first, if no escaping needed, just wrap in quotes. Most real strings don't need escaping.
- Code generation via new Function(): instead of building closures, generate a string of JS code and compile it. This is what fast-json-stringify does. The generated code can inline property access and avoid function call overhead.
- Pre-compute key+colon strings as template chunks: `'"name":'` etc.
- For objects, generate a single function that concatenates all fields without a loop.
- Avoid string concatenation in the hot path: use an array of chunks + join, or a chunked buffer approach.
- For the fast path (no escaping), avoid scanning char-by-char: use indexOf to check for special chars.
- Batch common patterns: for `{"ok":true,"id":N}` style responses, generate a template literal approach.

**Timeout**: If `./eval.sh` takes longer than 2 minutes, kill it and treat as failure.

**NEVER STOP**: Once the loop begins, do NOT pause to ask the human. If you run out of ideas, look at the per-case breakdown and target the slowest workload. Re-read the code. Try combining previous near-misses.
