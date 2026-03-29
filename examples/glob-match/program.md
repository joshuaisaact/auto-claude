# autoresearch: glob matching optimization

Optimize a glob pattern matcher in TypeScript for maximum matching throughput.

## Setup

1. Agree on a run tag (e.g. `mar28-glob`)
2. Create branch: `git checkout -b autoresearch/<tag>`
3. Read these files for context:
   - `src/glob.ts` -- the file you modify
   - `corpus.ts` -- frozen workload generator (do not modify)
   - `bench.ts` -- frozen benchmark runner (do not modify)
   - `verify.ts` -- frozen correctness checker (do not modify)
4. Install deps: `npm install`
5. Run the baseline: `./eval.sh`
6. Initialize results.tsv with the header and baseline result.

## Experimentation

Each experiment modifies the glob matcher, verifies correctness, then benchmarks.

**What you CAN do:**
- Modify `src/glob.ts`. Compilation strategy, matching algorithm, data structures, caching -- everything is fair game.
- Replace the regex-based approach entirely with a custom matcher (NFA, DFA, recursive backtracking, segment-based matching, etc.)
- Add intermediate compilation steps, lookup tables, fast paths.

**What you CANNOT do:**
- Modify `corpus.ts`, `bench.ts`, `verify.ts`, or `eval.sh`.
- Change the exported function signatures: `compile(pattern: string): Matcher` and `isMatch(path: string, pattern: string): boolean`.
- Change the `Matcher` or `TokenType` types.
- Use native addons, WASM, or worker threads.

**The goal: minimize METRIC (total ms for matching all workloads over 50 iterations).** Lower is better. The benchmark only measures match speed, not compilation speed — patterns are pre-compiled.

**Correctness contract:** `verify.ts` checks every result against picomatch. Our output must match picomatch exactly on all 5000 paths across all 10 patterns, plus edge cases.

**The first run**: Establish the baseline by running `./eval.sh` with the unmodified glob.ts.

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
a1b2c3d	500.0	keep	baseline
b2c3d4e	320.0	keep	hand-rolled segment matcher replacing regex
```

## The experiment loop

LOOP FOREVER:

1. Look at the current src/glob.ts and recent results
2. Form a hypothesis about what change will reduce the metric
3. Edit src/glob.ts
4. git commit
5. Run: `./eval.sh`
6. Read the METRIC line
7. If verify failed: fix the bug or revert
8. Record in results.tsv (do NOT commit this file)
9. If metric improved (lower number): keep the commit
10. If worse or equal: `git reset HEAD~1 --hard`

**Ideas to explore (roughly ordered by expected impact):**
- Replace regex with a custom segment-based matcher: split pattern and path by /, match segment by segment. Avoids regex compilation and backtracking.
- Fast path for common patterns: `**/*.ext` (just check endsWith), `dir/**` (just check startsWith)
- Pre-compute static prefix/suffix from the pattern — check those with simple string ops before matching the dynamic part
- For non-globstar patterns, split into segments and match each segment independently
- Brace expansion at compile time into multiple matchers, short-circuit on first match
- Character class matching via lookup table instead of regex
- String.endsWith / String.startsWith for literal prefix/suffix of the pattern
- Cache the compiled regex (already done via compile(), but the regex itself could be optimized)

**Timeout**: If `./eval.sh` takes longer than 2 minutes, kill it and treat as failure.

**NEVER STOP**: Once the loop begins, do NOT pause to ask the human. If you run out of ideas, look at the per-workload breakdown and target the slowest pattern. Re-read the code. Try combining previous near-misses.
