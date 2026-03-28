# Example: Performance optimization with perf stat

Example program.md for optimizing a hot path using hardware counters.

## Setup

```
1. Agree on a run tag (e.g. `mar28-perf`)
2. Create branch: `git checkout -b autoresearch/<tag>`
3. Read the codebase for context
4. Establish baseline with perf stat:
   taskset -c 0 perf stat -e cycles,instructions,L1-dcache-load-misses,L1-dcache-loads,branch-misses ./target/release/bench
5. Initialize results.tsv
```

## Experimentation

Each experiment modifies the hot path, builds, and measures with hardware counters.

**What you CAN do:**
- Modify `src/hot_path.rs`. Architecture, algorithms, data layout, SIMD, prefetch -- everything is fair game.

**What you CANNOT do:**
- Modify the benchmark harness or the public API.
- Add unsafe code that violates existing invariants.

**The goal: reduce cycles.** Use IPC (instructions/cycles) to diagnose. IPC < 1.0 means memory-stalled; focus on cache behavior. IPC > 2.0 means compute-bound; focus on instruction count.

**The first run**: Establish the baseline with perf stat.

## Output format

```
taskset -c 0 perf stat -e cycles,instructions,L1-dcache-load-misses,L1-dcache-loads,cache-references,branch-misses ./target/release/bench 2>&1 | tee run.log
```

Extract:
```
grep "cycles\|instructions" run.log
```

## Logging results

```
commit	cycles_M	ipc	l1_miss_rate	status	description
a1b2c3d	854	0.62	26.8	keep	baseline
b2c3d4e	800	0.72	20.1	keep	prefetch ctrl+data before probe loop
```

## The experiment loop

Same as the template. Key additions for perf work:

- **Always check IPC.** It tells you whether you're memory-bound or compute-bound. Don't guess.
- **Flush cache between A/B comparisons.** Otherwise the second run benefits from the first's residual cache state.
- **Pin to a single core.** `taskset -c 0` avoids migration noise.
- **Run 3-5 times, take median.** Single runs are noisy.
